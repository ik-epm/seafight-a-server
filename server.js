const http = require('http');
const ws = require('ws');
const port = 3000;
const wss = new ws.Server({noServer: true});
const clients = new Set();                       // набор сокетов

const requestHandler = (request, response) => {
  // все входящие запросы должны использовать websockets
  if (!request.headers.upgrade || request.headers.upgrade.toLowerCase() !== 'websocket') {
    response.end();
    return;
  }

  wss.handleUpgrade(request, request.socket, Buffer.alloc(0), onConnect);
}

const onConnect = (socket) => {
  clients.add(socket);                           // добавляем присоединившийся сокет в коллекцию сокетов

  socket.on('message', function (playerID) {
    let messageToClients = '';

    const game = checkGame(playerID);

    if (game) { // с нулом не обязательно сравнивать, потому что gheckGame нам и так вернет либо андефайнд, либо какую-то игру
      console.log('игра найдена:');
      // return checkGame(playerID);  <- в этом методе не нужен ретёрн, нам надо отправлять данные клиенту
      // поэтому пока записываем в переменную messageToClients простенькое сообщение
      messageToClients = 'игра найдена';
    } else if (gameRooms.length && gameRooms[gameRooms.length - 1].players.length < 2) {
      messageToClients = 'добавляем игрока в игру'
      console.log('следует добавить игрока')
      gameRooms[gameRooms.length - 1].players.push (new Player(playerID))
    } else {
      messageToClients = 'создаем игру'
      console.log('следует создать новую игру')
      createNewGame(playerID)
    }

    for(let client of clients) {
      // отправляем всем текущим сокетам все открытые игры (пока)
      client.send(messageToClients + JSON.stringify(gameRooms));
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



function createNewGame(playerID) {
  const newGame = new Game(gameRooms.length)
  newGame.players.push (new Player(playerID))
  gameRooms.push(newGame);
}


//конструктор для объекта "игра"
function Game(id) {
  this.gameID = id;
  this.players = [];
  this.gameOn = false;
  this.winner = '';
  this.gameOver = false;
}

function Player(id) {
  this.field = [];
  this.ships = [];
  this.username = '';
  this.id = id;
  this.playerIsShooter = false;
};

//массив игровых комнат
let gameRooms = [];

//функция проверки массива на игру с указанным playerID
function checkGame(playerID) {
  // let thisGame = null;
  gameRooms.forEach(game => {
    game.players.forEach(player => {
      if (player.id === playerID) {
        // thisGame = element;
        return game
      }
    })
  });
  // return thisGame;
}