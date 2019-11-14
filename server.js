const http = require('http');
const ws = require('ws');
const port = 3000;
const wss = new ws.Server({noServer: true});

const requestHandler = (request, response) => {
  // все входящие запросы должны использовать websockets
  if (!request.headers.upgrade || request.headers.upgrade.toLowerCase() !== 'websocket') {
    response.end();
    return;
  }

  wss.handleUpgrade(request, request.socket, Buffer.alloc(0), onConnect);
}

const onConnect = (socket) => {

  socket.on('message', function (gameSettings) {

    gameSettings = JSON.parse(gameSettings);
    let { state, username, userID } = gameSettings;

    switch (state) {
      case 'FIND_GAME':
        findGame(userID, username, socket, state);
        break;
      case 'START_GAME':
        startGame(userID, gameSettings, state);
        break;
      case 'FIRE':
        fire(userID, gameSettings, state);
        break;
      case 'PASS':
        // событие, когда один из игроков сдался
        pass(userID, state);
        break;
      // case 'TIMEOUT':
        // событие, когда вышло время
        // break;
      default:
        socket.send(JSON.stringify({message: 'Данное событие на сервере не найдено', state}))
        break;
    }
  });
}


const server = http.createServer(requestHandler)
server.listen(port, (err) => {
  if (err) {
    return console.log('something bad happened', err)
  }
  console.log(`server is listening on ${port}`)
});



// -----------------------


// вводим переменную timer в конструкторе игры
// каждый раз, когда отправляем стейт игры игрокам, обновляем таймер (функция sendState)
function setTimer(game) {
  let delay = 18e4;                     // таймер устанавливаем на 3 минуты
  let callback;
  console.log('запускаем таймер');

  if (game.gameOn) {
    callback = () => {
      game.winner = game.players.find(player => !player.playerIsShooter);
      game.gameOver = true
      game.messages.unshift('** Game over **', '-', '-', game.winner + ' is winner', '-');

      const {player1, player2} = getPlayers(game);
      console.log('время вышло');

      game.players[0].socket.send(JSON.stringify({state: 'TIMEOUT', ...player1}))
      game.players[1].socket.send(JSON.stringify({state: 'TIMEOUT', ...player2}))

      // тут удаляем игру
      let gameIndex = gameRooms.findIndex(currentGame => game.gameID === currentGame.gameID);
      gameRooms.splice(gameIndex, 1);
    }
  } else {
    callback = () => {
      game.winner = game.players.find(player => player.isReady);
      game.gameOver = true
      if (game.winner) {
        game.messages.unshift('** Game over **', '-', '-', game.winner + ' is winner', 'Time\'s up', '-');
      } else {
        game.messages.unshift('** Game over **', '-', '-', 'There is no winner', '-');
      }

      const {player1, player2} = getPlayers(game);
      console.log('время вышло');

      game.players[0].socket.send(JSON.stringify({state: 'TIMEOUT', ...player1}))
      game.players[1].socket.send(JSON.stringify({state: 'TIMEOUT', ...player2}))

      // тут удаляем игру
      let gameIndex = gameRooms.findIndex(currentGame => game.gameID === currentGame.gameID);
      gameRooms.splice(gameIndex, 1);
    }
  }

  return setTimeout(callback, delay);
}


function pass(userID, state) {
  let game = checkGame(userID);
  player = game.players.find(player => player.id === userID);
  game.winner = game.players.find(player => player.id !== userID).username;
  game.gameOver = true
  game.messages.unshift('** Game over **', '-', '-', game.winner + ' is winner', player.username + ' gave up', '-');

  const {player1, player2} = getPlayers(game);
  console.log(player1, player2);
  
  sendState(game, state, player1, player2);
}

function fire(userID, gameSettings, state) {
  let game = checkGame(userID);
  let player = game.players.find(player => player.id === userID);
  let enemy = game.players.find(player => player.id !== userID);
  const { firedCell } = gameSettings;
  firedCell = enemy.field[firedCell.coordX][firedCell.coordY]
  const { cellStatus, isShip, idShip } = firedCell;

  if (!cellStatus) {
    if (isShip) {
      firedCell.cellStatus = 'hit';
      const ship = enemy.ships.find((ship) => ship.id === idShip);
      ship.hits++;

      if (ship.hits === ship.size) {
        ship.isSunk = true;
        message = `${player.username} sank a ${enemy.username}'s ship on x: ${firedCell.coordY + 1} y: ${firedCell.coordX + 1}`;
        ship.coords.forEach((coords) => setMissCellStatusAround(coords, enemy));
      } else {
        message = `${player.username} shot ${enemy.username} on x: ${firedCell.coordY + 1} y: ${firedCell.coordX + 1}`;
      }
    } else {
      firedCell.cellStatus = 'miss';
      message = `${player.username} missed ${enemy.username} on x: ${firedCell.coordY + 1} y: ${firedCell.coordX + 1}`;
      player.playerIsShooter = !player.playerIsShooter;
      enemy.playerIsShooter = !enemy.playerIsShooter;
    }
    game.messages.unshift(message);
  }

  if (enemy.ships.every((ship) => ship.isSunk)) {
    game.winner = player.username;
    game.messages.unshift('** Game over **', '-', '-', game.winner + ' is winner', '-');
    game.gameOver = true;
  }

  const {player1, player2} = getPlayers(game);
  sendState(game, state, player1, player2);
}


function setMissCellStatusAround(coords, target) {
  const { coordX, coordY } = coords;
  const changeCellStatus = (target, coordX, coordY) => {
    const cell = target.field[coordX][coordY];
    const isCell = target.field[coordX]
      && target.field[coordX][coordY];

    if (isCell && !cell.isShip) {
      cell.cellStatus = 'miss';
    }
  };

  const cellsCount = 3;             // 3 - количество ячеек вокруг исходной ячейки
  for (let i = 0; i < cellsCount; i++) {
    const y = coordY - 1 + i;
    for (let j = 0; j < cellsCount; j++) {
      const x = coordX - 1 + j;
      changeCellStatus(target, x, y);
    }
  }
}


function startGame(userID, gameSettings, state) {
  const { ships, field } = gameSettings;

  let game = checkGame(userID);
  let currentPlayer = game.players.find(player => player.id === userID);
  currentPlayer.isReady = true;

  currentPlayer.ships = ships;
  currentPlayer.field = field;

  shooterIndex = Math.round(Math.random() * (game.players.length - 1));
  game.players[shooterIndex].playerIsShooter = true;

  if (game.players.every(player => player.isReady)) {
    game.gameOn = true;

    const player1 = {
      playerIsShooter: game.players[0].playerIsShooter,
      isEnemyReady: true
    };
    const player2 = {
      playerIsShooter: game.players[1].playerIsShooter,
      isEnemyReady: true
    };
    sendState(game, state, player1, player2);
  }
}


function findGame(userID, username, socket, state) {
  let game = checkGame(userID);

  if (game) {
    console.log('игра найдена:');
  } else if (gameRooms.length && gameRooms[gameRooms.length - 1].players.length < 2) {
    game = gameRooms[gameRooms.length - 1]
    console.log('добавляем игрока')
    game.players.push(new Player(userID, username, socket))
  } else {
    console.log('создаем новую игру')
    game = createNewGame(userID, username, socket)
  }

  if (game.players.length === 2) {
    const {player1, player2} = getPlayers(game);
    sendState(game, state, player1, player2);
  }
}


function sendState(game, state, player1, player2) {
  clearTimeout(game.timer);
  game.timer = setTimer(game);

  game.players[0].socket.send(JSON.stringify({state, ...player1}))
  game.players[1].socket.send(JSON.stringify({state, ...player2}))
}


function getPlayers (game) {
  const { gameOn, gameOver, winner, messages } = game;
  const player1 = {
    gameOn,
    gameOver,
    winner,
    messages,
    playerIsShooter: game.players[0].playerIsShooter,
    player: {
      // id: game.players[0].id,
      // username: game.players[0].username,
      ships: game.players[0].ships,
      field: game.players[0].field,
      // isReady: game.players[0].isReady
    },
    enemy: {
      username: game.players[1].username,
      field: game.players[1].field,
    }
  }
  const player2 = {
    gameOn,
    gameOver,
    winner,
    messages,
    playerIsShooter: game.players[1].playerIsShooter,
    player: {
      // id: game.players[1].id,
      // username: game.players[1].username,
      ships: game.players[0].ships,
      field: game.players[1].field,
      // isReady: game.players[1].isReady
    },
    enemy: {
      username: game.players[0].username,
      field: game.players[0].field,
    }
  }

  return {player1, player2}
}


function createNewGame(playerID, username, socket) {
  const newGame = new Game(gameRooms.length + Date.now());
  newGame.players.push(new Player(playerID, username, socket));
  gameRooms.push(newGame);
  return gameRooms[gameRooms.length - 1];
}

// конструктор для объекта "игра"
function Game(id) {
  this.gameID = id;
  this.players = [];
  this.gameOn = false;
  this.winner = '';
  this.gameOver = false;
  this.messages = [];
  this.timer = null;
}

function Player(id, username, socket) {
  this.field = null;
  this.ships = [];
  this.username = username;
  this.id = id;
  this.playerIsShooter = false;
  this.socket = socket;
  this.isReady = false;
};

// массив игровых комнат
let gameRooms = [];

// функция проверки массива на игру с указанным playerID
function checkGame(playerID) {
  return gameRooms.find(game => {
    return game.players.find(player => player.id === playerID)
  })
}