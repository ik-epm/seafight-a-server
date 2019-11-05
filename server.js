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

  socket.on('message', function (message) {
    // тут работаем с пришедшими данными и записываем результат в новую переменную
    const newData = `Мы ${message.toLowerCase()} на серве вертели`;

    for(let client of clients) {
      client.send(newData);                      // отправляем всем текущим сокетам новые данные
    }
  });
}


const server = http.createServer(requestHandler)
server.listen(port, (err) => {
  if (err) {
    return console.log('something bad happened', err)
  }
  console.log(`server is listening on ${port}`)
})