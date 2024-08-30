const express = require('express');
const cors = require('cors');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use(cors());
app.use('/', express.static('public'));

io.on('connection', (socket) => {
    socket.on('join', (roomId) => {
        const clients = io.sockets.adapter.rooms.get(roomId) || new Set();

        if (clients.size >= 4) {
            socket.emit('full_room');
            return;
        }

        socket.join(roomId);
        console.log(`Client ${socket.id} joined room ${roomId}`);

        socket.emit('existing_clients', Array.from(clients));
        socket.to(roomId).emit('new_client', socket.id);
    });

    socket.on('webrtc_offer', (data) => {
        socket.to(data.targetId).emit('webrtc_offer', {
            sdp: data.sdp,
            senderId: socket.id
        });
    });

    socket.on('webrtc_answer', (data) => {
        socket.to(data.targetId).emit('webrtc_answer', {
            sdp: data.sdp,
            senderId: socket.id
        });
    });

    socket.on('webrtc_ice_candidate', (data) => {
        socket.to(data.targetId).emit('webrtc_ice_candidate', {
            candidate: data.candidate,
            senderId: socket.id
        });
    });

    // 사용자가 나갔을 때 처리
    socket.on('disconnect', () => {
        console.log(`Client ${socket.id} disconnected`);
        socket.broadcast.emit('client_disconnected', socket.id);
    });
});

function startServer() {
    const port = process.env.PORT || 3000;
    server.listen(port, () => {
        console.log(`Server is listening on port ${port}`);
    });
}

module.exports = { startServer };
