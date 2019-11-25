const express = require('express');
const ws = require('ws');
const fs = require("fs");
const port = 3000;
const app = express();
const wss = new ws.Server({
  noServer: true
});

fs.readFile('server-state.json', (error, data) => {
  console.log('Асинхронное чтение файла');
  if (error) {
    console.log('Ошибка');
    throw error; // если возникла ошибка
  }
  if (data.byteLength) {
      // console.log('Данные: ', data.byteLength);
    gameRooms = JSON.parse(data);
    gameRooms.forEach(game => {
      game.timerID = setTimer(game);
    })
  }
});

const requestHandler = (request, response) => {
  // все входящие запросы должны использовать websockets
  if (!request.headers.upgrade || request.headers.upgrade.toLowerCase() !== 'websocket') {
    response.end();
    return;
  }

  wss.handleUpgrade(request, request.socket, Buffer.alloc(0), onConnect);
};

const onConnect = (socket) => {

  socket.on('close', function() {

    let player;
    const state = 'CLOSE';
    let game = gameRooms.find(game => {
      player = game.players.find(player => player.socket === socket);
      return player;
    });

    if (game && game.players.length === 2) {
      player.socket = null;
      game.messages.unshift(player.username + ' disconnected');
      const { player1, player2 } = getPlayers(game);
      sendState(game, state, player1, player2);
    } else if (game) {
      deleteGame(game);
    }
  });

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
        socket.send(JSON.stringify({
          message: 'Данное событие на сервере не найдено',
          state
        }));
        break;
    }
  });
};


const server = app.use(requestHandler);
server.listen(port, (err) => {
  if (err) {
    return console.log('something bad happened', err)
  }
  console.log(`server is listening on ${port}`)
});



// -----------------------

// вводим переменные time и timerID в конструкторе игры
// каждый раз, когда отправляем стейт игры игрокам, обновляем таймер (функция sendState)
function setTimer(game) {
  // let delay = 18e4;                     // таймер устанавливаем на 3 минуты
  game.time = 180;                     // таймер устанавливаем на 3 минуты (время в секундах)
  let callback;
  console.log('запускаем таймер');
  const state = 'TIMEOUT';

  if (game.gameOn) {
    callback = () => {
      console.log(game.time, game.time === 0);
      if (--game.time < 0) {
        clearInterval(game.timerID);
        game.winner = game.players.find(player => !player.playerIsShooter).username;
        game.gameOver = true;
        game.messages.unshift('** Game over **', '-', '-', game.winner + ' is winner', '-');
        const { player1, player2 } = getPlayers(game);
        console.log('время вышло');
        sendState(game, state, player1, player2)
      }
    }
  } else {
    callback = () => {
      console.log(game.time, game.time === 0);
      if (--game.time < 0) {
        clearInterval(game.timerID);
        const winner = game.players.find(player => player.isReady);
        game.gameOver = true;
        if (winner) {
          game.winner = winner.username;
          game.messages.unshift('** Game over **', '-', '-', game.winner + ' is winner', 'Time\'s up', '-');
        } else {
          game.messages.unshift('** Game over **', '-', '-', 'There is no winner', '-');
        }
        const { player1, player2 } = getPlayers(game);
        console.log('время вышло');
        sendState(game, state, player1, player2)
      }
    }
  }
  return setInterval(callback, 1000);
}


function pass(userID, state) {
  let game = checkGame(userID);
  if (game && game.players.length === 2) {
    const player = game.players.find(player => player.id === userID);
    game.winner = game.players.find(player => player.id !== userID).username;
    game.gameOver = true;
    game.messages.unshift('** Game over **', '-', '-', game.winner + ' is winner', player.username + ' give up', '-');

    const { player1, player2 } = getPlayers(game);
    sendState(game, state, player1, player2);
  }
}

function fire(userID, gameSettings, state) {
  let game = checkGame(userID);
  if (game) {
    let player = game.players.find(player => player.id === userID);
    let enemy = game.players.find(player => player.id !== userID);
    let message = [];
    const {
      cell: {
        coordX,
        coordY
      }
    } = gameSettings;
    const cell = enemy.field[coordX][coordY];
    const { cellStatus, isShip, idShip } = cell;

    if (!cellStatus) {
      if (isShip) {
        cell.cellStatus = 'hit';
        const ship = enemy.ships.find((ship) => ship.id === idShip);
        ship.hits++;

        if (ship.hits === ship.size) {
          ship.isSunk = true;
          message = [`${player.username} sank a ${enemy.username}'s ship on x: ${coordY + 1} y: ${coordX + 1}`];
          ship.coords.forEach((coords) => setMissCellStatusAround(coords, enemy));
        } else {
          message = [`${player.username} shot ${enemy.username} on x: ${coordY + 1} y: ${coordX + 1}`];
        }
      } else {
        cell.cellStatus = 'miss';
        message = ['-', `${player.username} missed ${enemy.username} on x: ${coordY + 1} y: ${coordX + 1}`];
        player.playerIsShooter = !player.playerIsShooter;
        enemy.playerIsShooter = !enemy.playerIsShooter;
      }
      game.messages.unshift(...message);
    }

    if (enemy.ships.every((ship) => ship.isSunk)) {
      game.winner = player.username;
      game.messages.unshift('** Game over **', '-', '-', game.winner + ' is winner', '-');
      game.gameOver = true;
    }

    const { player1, player2 } = getPlayers(game);
    sendState(game, state, player1, player2);
  }
}

function setMissCellStatusAround(coords, target) {
  const { coordX, coordY } = coords;
  const changeCellStatus = (target, coordX, coordY) => {
    const isCell = target.field[coordX]
      && target.field[coordX][coordY];

    if (isCell) {
      const cell = target.field[coordX][coordY];
      if (!cell.isShip) cell.cellStatus = 'miss';
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
  if (game) {
    let currentPlayer = game.players.find(player => player.id === userID);
    currentPlayer.isReady = true;

    currentPlayer.ships = ships;
    currentPlayer.field = field;
  }

  if (game && game.players.length === 2 && game.players.every(player => player.isReady)) {
    const shooterIndex = Math.round(Math.random() * (game.players.length - 1));
    game.players[shooterIndex].playerIsShooter = true;
    // game.players[Number(!shooterIndex)].playerIsShooter = false; // <- а это зачем добавил, если по-умолчанию итак фолс идет в настройках конструктора?
    game.gameOn = true;
    game.messages.unshift(game.players[shooterIndex].username + ' shoots first');

    const { player1, player2 } = getPlayers(game);
    sendState(game, state, player1, player2);
  }
}


function findGame(userID, username, socket, state) {
  let game = checkGame(userID);

  if (game) {
    console.log('игра найдена:');
  } else if (gameRooms.length && gameRooms[gameRooms.length - 1].players.length < 2) {
    game = gameRooms[gameRooms.length - 1];
    console.log('добавляем игрока');
    game.players.push(new Player(userID, username))
  } else {
    console.log('создаем новую игру');
    game = createNewGame(userID, username)
  }

  let player = game.players.find(player => player.id === userID);
  if (!player.socket) {
    game.messages.unshift(player.username + ' join the game');
  }
  player.socket = socket;

  if (game.players.length === 2) {
    const { player1, player2 } = getPlayers(game);
    sendState(game, state, player1, player2);
  }
}

function deleteGame(game) {
  game.players.forEach((player) => {
    if (player.socket) {
      player.id = null
    }
    player.socket = null;
  })

  const delay = 18e4;                // таймер удаления игры устанавливаем на 3 минут
  const callback = () => {
    let gameIndex = gameRooms.findIndex(currentGame => game.gameID === currentGame.gameID);
    gameRooms.splice(gameIndex, 1);
  }

  if (game.players.length < 2) {
    callback()
  } else {
    setTimeout(callback, delay)
  }
}


function sendState(game, state, player1, player2) {
  const jsonReplacer = (key, value) => {
    if (key == 'timerID' || key == 'socket') {
      return undefined;
    }
    return value;
  };

  let problems = game.players.some(player => !player.socket)
   || (game.players.find(player => player.isReady) && game.messages[0].includes('join the game'));
  console.log(game.gameOn, game.messages[0]);

 if (!problems && !game.gameOver) {
    clearInterval(game.timerID)
    game.timerID = setTimer(game);
    player1.time = game.time;
    player2.time = game.time;
  }

  if (game.players[0].socket) {
    game.players[0].socket.send(JSON.stringify({ state, ...player1 }, jsonReplacer));
  }
  if (game.players[1].socket) {
    game.players[1].socket.send(JSON.stringify({ state, ...player2 }, jsonReplacer));
  }

  if (game.gameOver) {
    deleteGame(game);
  }
  const data = JSON.stringify(gameRooms, jsonReplacer);
  fs.writeFile('server-state.json', data, (error) => {
    console.log('Асинхронная запись файла');
    if (error) {
      console.log('Ошибка');
      throw error; // если возникла ошибка
    }
  });
}

function getPlayers(game) {
  const { gameOn, gameOver, winner, messages, time } = game;
  const player1 = {
    time,
    gameOn,
    gameOver,
    winner,
    messages,
    playerIsShooter: game.players[0].playerIsShooter,
    player: {
      ships: game.players[0].ships,
      field: game.players[0].field
    },
    enemy: {
      username: game.players[1].username,
      field: game.players[1].field
    }
  };
  const player2 = {
    time,
    gameOn,
    gameOver,
    winner,
    messages,
    playerIsShooter: game.players[1].playerIsShooter,
    player: {
      ships: game.players[1].ships,
      field: game.players[1].field
    },
    enemy: {
      username: game.players[0].username,
      field: game.players[0].field
    }
  };

  return { player1, player2 }
}


function createNewGame(playerID, username) {
  const newGame = new Game(gameRooms.length + Date.now());
  newGame.players.push(new Player(playerID, username));
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
  this.time = 0;
  this.timerID = null;
}

function Player(id, username) {
  this.field = null;
  this.ships = [];
  this.username = username;
  this.id = id;
  this.playerIsShooter = false;
  this.socket = null;
  this.isReady = false;
}

// массив игровых комнат
let gameRooms = [];

// функция проверки массива на игру с указанным playerID
function checkGame(playerID) {
  return gameRooms.find(game => {
    return game.players.find(player => player.id === playerID)
  })
}
