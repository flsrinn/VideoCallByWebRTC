const roomSelectionContainer = document.getElementById('room-selection-container');
const roomInput = document.getElementById('room-input');
const connectButton = document.getElementById('connect-button');

const videoChatContainer = document.getElementById('video-chat-container');
const localVideoComponent = document.getElementById('local-video');
const remoteVideoComponent = document.getElementById('remote-video');

const socket = io();
const mediaConstraints = {
    audio: true,
    video: { width: 1280, height: 720 }
};
let localStream = null;
let peerConnections = {};
let roomId;

const iceServers = {
    iceServers: [
        {urls: 'stun:stun.l.google.com:19302'}, 
        {urls: 'stun:stun1.l.google.com:19302'}, 
        {urls: 'stun:stun2.l.google.com:19302'}, 
        {urls: 'stun:stun3.l.google.com:19302'}, 
        {urls: 'stun:stun4.l.google.com:19302'}, 
    ]
};

connectButton.addEventListener('click', async () => {
    try {
        await initializeLocalStream();
        joinRoom(roomInput.value);
    } catch (error) {
        console.error('Error initializing local stream:', error);
        alert('Could not access your camera. Please check your permissions.');
    }
});

socket.on('room_created', () => {
    console.log('Room created');
});

socket.on('room_joined', () => {
    console.log('Joined room');
});

socket.on('full_room', () => {
    alert('The room is full');
});

socket.on('existing_clients', async (clients) => {
    console.log('Existing clients:', clients);
    for (const clientId of clients) {
        await createPeerConnection(clientId);
        const offer = await peerConnections[clientId].createOffer();
        await peerConnections[clientId].setLocalDescription(offer);
        console.log(`Sending offer to ${clientId}`);
        socket.emit('webrtc_offer', {
            sdp: offer,
            targetId: clientId
        });
    }
});

socket.on('new_client', async (clientId) => {
    console.log('New client joined:', clientId);
    await createPeerConnection(clientId);
});

socket.on('webrtc_offer', async (data) => {
    console.log('Received offer from', data.senderId);
    if (!peerConnections[data.senderId]) {
        await createPeerConnection(data.senderId);
    }
    await peerConnections[data.senderId].setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await peerConnections[data.senderId].createAnswer();
    await peerConnections[data.senderId].setLocalDescription(answer);
    console.log(`Sending answer to ${data.senderId}`);
    socket.emit('webrtc_answer', {
        sdp: answer,
        targetId: data.senderId
    });
});

socket.on('webrtc_answer', async (data) => {
    console.log('Received answer from', data.senderId);
    await peerConnections[data.senderId].setRemoteDescription(new RTCSessionDescription(data.sdp));
});

socket.on('webrtc_ice_candidate', async (data) => {
    console.log('Received ICE candidate from', data.senderId);
    const candidate = new RTCIceCandidate(data.candidate);
    await peerConnections[data.senderId].addIceCandidate(candidate).catch(error => {
        console.error('Error adding ICE candidate:', error);
    });
});

async function initializeLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        localVideoComponent.srcObject = localStream;
        showVideoConference();
    } catch (error) {
        console.error('Error accessing local stream:', error);
        throw error;
    }
}

function showVideoConference() {
    roomSelectionContainer.style.display = 'none';
    videoChatContainer.style.display = 'flex';

    // Show the end call button
    const endCallButton = document.getElementById('end-call-button');
    endCallButton.style.display = 'block';
}


async function joinRoom(room) {
    if (!room) {
        alert('Please enter a room ID');
        return;
    }
    roomId = room;
    socket.emit('join', room);
}

async function createPeerConnection(clientId) {
    if (peerConnections[clientId]) {
        console.warn(`PeerConnection for ${clientId} already exists.`);
        return peerConnections[clientId];
    }

    const peerConnection = new RTCPeerConnection(iceServers);
    peerConnections[clientId] = peerConnection;

    // ICE candidate 이벤트 핸들러
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log(`Sending ICE candidate to ${clientId}`);
            socket.emit('webrtc_ice_candidate', {
                targetId: clientId,
                candidate: event.candidate
            });
        }
    };

    // track 이벤트 핸들러 - 원격 비디오 스트림을 처리
    peerConnection.ontrack = (event) => {
        handleTrack(event, clientId);
    };

    // ICE connection 상태 변화 처리
    peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection.iceConnectionState === 'disconnected') {
            console.log(`PeerConnection with ${clientId} disconnected`);
            // 연결 해제 시 비디오 요소를 제거하거나 다른 처리를 할 수 있습니다.
            let remoteVideo = document.getElementById(clientId);
            if (remoteVideo) {
                videoChatContainer.removeChild(remoteVideo);
            }
        }
    };

    // 로컬 스트림의 모든 트랙을 PeerConnection에 추가
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    return peerConnection;
}

function handleTrack(event, clientId) {
    // 동일한 MediaStream에 대해 중복 처리를 피하기 위해 스트림 ID를 추적
    const stream = event.streams[0];
    const videoElementId = `${clientId}`;
    let video = document.getElementById(videoElementId);

    if (!video) {
        // 새로운 스트림에 대해 비디오 요소를 생성
        video = document.createElement("video");
        video.id = videoElementId;
        video.className = 'remote-video';
        video.autoplay = true;
        video.playsInline = true;

        console.log(`새로운 영상 ${videoElementId}`)
        remoteVideoComponent.appendChild(video);
        console.log(`Created new video element for ${clientId} with stream ${stream.id}`);
    } else {
        console.log(`Using existing video element for ${clientId} with stream ${stream.id}`);
    }

    // 스트림을 비디오 요소에 연결
    if (video.srcObject !== stream) {
        video.srcObject = stream;
        console.log(`Video element for ${clientId} is now playing stream ${stream.id}`);
    }
}