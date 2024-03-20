const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

const clients = [];

wss.on('connection', function connection(ws) {
    clients.push(ws);

    ws.on('message', function incoming(message) {
        console.log('Server received: %s', message);
        // Broadcast message to all clients except the sender
        clients.forEach(function each(client) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    });

    ws.on('close', function close() {
        clients.splice(clients.indexOf(ws), 1);
    });
});
