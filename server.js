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

  socket.on('message', function (id) {
    if (checkGameID(id) !== null) {
      console.log('игра найдена:');
      return checkGameID(id);
    } else {
      console.log('следует создать новую игру')
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


//конструктор для объекта "игра"
function Game(id) {
  this.gameID = id;
  this.player1 = {
      field: [],
      ships: [],
      username: '',
      id: '',
      playerIsShooter: false
  };
  this.player2 = {
      field: [],
      ships: [],
      username: '',
      id: '',
      playerIsShooter: false
  };
  this.gameOn = false;
  this.winner = '';
  this.gameOver = false;
}

//массив игровых комнат
let gameRooms = [];

//функция проверки массива на игру с указанным gameID
function checkGameID(gameID) {
  let thisGame = null;
  gameRooms.forEach((element) => {
      if (element.gameID == gameID) {
          thisGame = element;
      }
  });
  return thisGame;
}