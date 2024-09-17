const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const { Buffer } = require('buffer');

const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const { exec } = require('child_process'); 

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const users = {};           
const userSocketMap = {}; 

io.on('connection', (socket) => {
    socket.on('join-room', (user) => {
        const [userId, name, room] = user.split(';');
        const roomId = room;
    
        console.log(`사용자 ${userId}(${name})가 방 ${roomId}에 참여했습니다.`);
    
        // 사용자의 소켓 ID와 이름을 저장
        users[socket.id] = { userId, username: name };
        socket.join(roomId);
    
        // 기존 클라이언트 정보(이름 포함)를 전송
        const clientsInRoom = io.sockets.adapter.rooms.get(roomId) || new Set();
        const clients = Array.from(clientsInRoom).filter(id => id !== socket.id);
        const existingClientsInfo = clients.map(clientId => ({
            clientId: clientId,
            username: users[clientId]?.username || 'Anonymous'
        }));
    
        socket.emit('existing_clients', existingClientsInfo);
    
        // 새로운 클라이언트가 입장했음을 다른 클라이언트들에게 알림
        socket.to(roomId).emit('new_client', { clientId: socket.id, username: name });
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

    socket.on('chat_message', (data) => {
        if (data.roomId) {
            io.in(data.roomId).emit('chat_message', {
                sender: data.sender,  // 사용자 이름 포함
                message: data.message
            });
        }
    });    

    socket.on('start-conference', (roomId) => {
        socket.join(roomId); // 방에 참여
    
        setTimeout(() => {
            const clientsInRoom = io.sockets.adapter.rooms.get(roomId) || new Set();
            const clients = Array.from(clientsInRoom).filter(id => id !== socket.id);
    
            if (clients.length > 0) {
                socket.emit('existing_clients', clients);
                clients.forEach(clientId => {
                    const clientSocket = io.sockets.sockets.get(clientId);
                    if (clientSocket) {
                        console.log(`Sending new_client event with username: ${clientSocket.username}`);
                        socket.emit('new_client', {
                            clientId: clientSocket.id,
                            username: clientSocket.username  // 닉네임 전송
                        });
                    }
                });
            }
        }, 100);
    });    

    socket.on('transcription', (data) => {
        const { roomId, senderId, senderName, transcript } = data;

        if (roomId) {
            socket.to(roomId).emit('transcription', {
                senderId: senderId,
                senderName: senderName,
                transcript: transcript
            });
        }
    });

    // 클라이언트가 방을 떠날 때 처리
    socket.on('leave-room', (roomId) => {
        if (roomId) {
            console.log(`클라이언트 ${socket.id}가 방 ${roomId}에서 나갔습니다.`);
            socket.leave(roomId); // 클라이언트를 방에서 제거
            
            // 방의 다른 클라이언트들에게 해당 클라이언트가 방을 떠났음을 알림
            socket.to(roomId).emit('client_left', socket.id);

            // 방 ID 초기화
            roomId = null;
        }
    });

    // 클라이언트가 연결을 끊을 때 처리
    socket.on('disconnect', () => {
        console.log('클라이언트 연결 종료:', socket.id);
        const rooms = Array.from(socket.rooms);
        rooms.forEach(roomId => {
            socket.to(roomId).emit('client_left', socket.id);
            socket.leave(roomId);
        });
    });
});


const ngrokPath = "C:\\ngrok\\ngrok.exe";
const ngrokCommand = `ngrok http 3000 --domain=glorious-urchin-preferably.ngrok-free.app`;

function startServer() {
    const port = process.env.PORT || 3000;
    server.listen(port, () => {
        console.log(`서버 오픈 포트번호:${port}`);
        // ngrok 명령어 실행
        exec(ngrokCommand, (error, stdout, stderr) => {
            if (error) {
                console.error(`ngrok 실행 중 오류가 발생했습니다: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`ngrok stderr: ${stderr}`);
                return;
            }
            console.log(`ngrok stdout: ${stdout}`);
        });
    });
}

module.exports = { startServer };
