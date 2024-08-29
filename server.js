const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use('/', express.static('public'));

io.on('connection', (socket) => {
    socket.on('join', (roomId) => {
        const clients = io.sockets.adapter.rooms.get(roomId) || new Set();

        if (clients.size >= 4) {  // 최대 클라이언트 수를 설정 
            socket.emit('full_room');
            return;
        }

        socket.join(roomId); // 클라이언트 입장 
        console.log(`Client ${socket.id} joined room ${roomId}`);

        socket.emit('existing_clients', Array.from(clients)); // 이미 존재하는 클라이언트인지 확인 
        socket.to(roomId).emit('new_client', socket.id); // 
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
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});
