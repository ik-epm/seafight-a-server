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
    let {state, userID} = gameSettings;

    switch (state) {
      case 'FIND_GAME':
        findGame(userID, socket);
        break;
      case 'START_GAME':
        break;
      case 'FIRE':
        break;
      default:
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


function startGame(userID, socket, gameSettings) {
  const {ships, field, gameOn} = gameSettings;

  let game = checkGame(userID);

  shooter = Math.round(Math.random()) ? true : false;
  
}


function findGame(userID, socket) {
  let messageToClients = '';

  let game = checkGame(userID);

  if (game) {
    console.log('игра найдена:');
    messageToClients = 'игра найдена';
  } else if (gameRooms.length && gameRooms[gameRooms.length - 1].players.length < 2) {
    game = gameRooms[gameRooms.length - 1]
    messageToClients = 'добавляем игрока в игру'
    console.log('добавляем игрока')
    game.players.push(new Player(userID, socket))
  } else {
    messageToClients = 'создаем игру'
    console.log('создаем новую игру')
    game = createNewGame(userID, socket)
  }

  if (game.players.length === 2) {

    const {player1, player2} = getPlayers(game);

    game.players[0].socket.send(JSON.stringify({message: 'first player', ...player1}))
    game.players[1].socket.send(JSON.stringify({message: 'second player', ...player2}))
  }

  // game.players.forEach((player, i) => {
  //   player.socket.send(JSON.stringify({messageToClients}))
  // })

  // for(let client of clients) {
  //   console.log(client);
  //   // отправляем всем текущим сокетам все открытые игры (пока)
  //   client.send(messageToClients + JSON.stringify(gameRooms));
  // }
}


function getPlayers (game) {
  const {gameOn, gameOver, winner} = game;
  const player1 = {
    gameOn,
    gameOver,
    winner,
    player: {
      // id: game.players[0].id,
      // username: game.players[0].username,
      field: game.players[0].field,
      playerIsShooter: game.players[0].playerIsShooter,
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
    player: {
      // id: game.players[1].id,
      // username: game.players[1].username,
      field: game.players[1].field,
      playerIsShooter: game.players[1].playerIsShooter,
      // isReady: game.players[1].isReady
    },
    enemy: {
      username: game.players[0].username,
      field: game.players[0].field,
    }
  }

  return {player1, player2}
}


function createNewGame(playerID, socket) {
  const newGame = new Game(gameRooms.length + Date.now());
  newGame.players.push(new Player(playerID, socket));
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
}

function Player(id, socket) {
  this.field = [];
  this.ships = [];
  this.username = '';
  this.id = id;
  this.playerIsShooter = false;
  this.socket = socket;
  this.isReady = false;
};

// массив игровых комнат
let gameRooms = [];

// функция проверки массива на игру с указанным playerID
function checkGame(playerID) {
  // gameRooms.forEach(game => {
  //   game.players.forEach(player => {
  //     if (player.id === playerID) {
  //       return game
  //     }
  //   })
  // });


  return gameRooms.find(game => {
    return game.players.find(player => player.id === playerID)
  })

}