const roomSelectionContainer = document.getElementById('room-selection-container');
const roomInput = document.getElementById('room-input');

const videoChatContainer = document.getElementById('video-chat-container');
const localVideoComponent = document.getElementById('local-video');
const remoteVideoComponent = document.getElementById('remote-video');

let previewStream = null;
let isVideoEnabled = true;
let isAudioEnabled = true;

const socket = io();
const mediaConstraints = {
    audio: true,
    video: { width: 1280, height: 720 }
};
let localStream = null;
let peerConnections = {};
let roomId;
let userId;
let username;
const clientUsernames = {};
const peerRecorders = {};
const peerAudioChunks = {};

const iceServers = {
    iceServers: [
        {urls: 'stun:stun.l.google.com:19302'}, 
        {urls: 'stun:stun1.l.google.com:19302'}, 
        {urls: 'stun:stun2.l.google.com:19302'}, 
        {urls: 'stun:stun3.l.google.com:19302'}, 
        {urls: 'stun:stun4.l.google.com:19302'}, 
    ]
};

socket.on('connect', () => {
    userId = socket.id;  // 사용자가 서버에 연결되었을 때 userId를 설정
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
    
    for (const client of clients) { 
        const { clientId, username } = client;
        
        clientUsernames[clientId] = username;

        if (!peerConnections[clientId]) {
            await createPeerConnection(clientId);
            const offer = await peerConnections[clientId].createOffer();
            await peerConnections[clientId].setLocalDescription(offer);
            console.log(`Sending offer to ${clientId}`);
            socket.emit('webrtc_offer', {
                sdp: offer,
                targetId: clientId
            });
        }
    }
});

socket.on('new_client', async (data) => {
    console.log(`New client connected: ${data.clientId} (${data.username})`);
    
    const clientId = data.clientId;
    const username = data.username;

    clientUsernames[clientId] = username;

    if (!peerConnections[clientId]) {
        const peerConnection = await createPeerConnection(clientId);
    }
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

socket.on('transcription', (data) => {
    const { senderId, senderName, transcript } = data;

    if (senderId !== userId) {
        appendToTranscription(transcript, senderId);
    }
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
    videoChatContainer.style.display = 'flex';

    document.getElementById('invite-button').style.display = 'block';
    document.getElementById('chat-button').style.display = 'block';
    document.getElementById('control-buttons-container').style.display = 'block';
}

// 방 입장 후 이름과 함께 서버에 전송
async function joinRoom(room, username) {
    if (!room) {
        alert('Please enter a room ID');
        return;
    }
    roomId = room;
    socket.emit('join-room', `${userId};${username};${roomId}`);  // 사용자 ID와 이름을 전송

    startRecording();
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
    const stream = event.streams[0];
    const videoWrapperId = `video-wrapper-${clientId}`;
    let videoWrapper = document.getElementById(videoWrapperId);

    if (!videoWrapper) {
        const username = clientUsernames[clientId] || 'Anonymous';

        // 비디오와 닉네임을 감싸는 wrapper 생성
        videoWrapper = document.createElement("div");
        videoWrapper.id = videoWrapperId;
        videoWrapper.className = 'video-wrapper';

        // 비디오 요소 생성
        const videoElement = document.createElement("video");
        videoElement.id = `video-${clientId}`; // 고유한 비디오 ID 사용
        videoElement.srcObject = stream;
        videoElement.autoplay = true;
        videoElement.playsInline = true;

        // 닉네임 요소 생성
        const nicknameElement = document.createElement('div');
        nicknameElement.className = 'video-nickname';
        nicknameElement.textContent = username;

        // 비디오와 닉네임을 wrapper에 추가
        videoWrapper.appendChild(videoElement);
        videoWrapper.appendChild(nicknameElement);

        // wrapper를 비디오 컨테이너에 추가
        remoteVideoComponent.appendChild(videoWrapper);
    } else {
        const videoElement = videoWrapper.querySelector('video');
        if (videoElement.srcObject !== stream) {
            videoElement.srcObject = stream;
        }
    }
}

// 변환된 텍스트를 화면에 추가
function appendToTranscription(transcript, clientId) {
    const transcriptionEl = document.getElementById('ai-transcription-result');
    transcriptionEl.value += transcript; // 참가자 이름과 함께 추가
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initializePreviewStream();
    } catch (error) {
        console.error('Error initializing local stream:', error);
        alert('Could not access your camera. Please check your permissions.');
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    roomId = urlParams.get('roomId');

    console.log(`roomId: ${roomId}`);
});

async function initializePreviewStream() {
    try {
        previewStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        const previewVideo = document.getElementById('preview-video');
        previewVideo.srcObject = previewStream;
    } catch (error) {
        console.error('Error accessing preview stream:', error);
        throw error;
    }
}

document.getElementById('prep-camera-toggle-button').addEventListener('click', () => {
    isVideoEnabled = !isVideoEnabled;
    previewStream.getVideoTracks()[0].enabled = isVideoEnabled;

    const camImg = document.getElementById('prep-cam-img');
    camImg.src = isVideoEnabled ? './images/cam-on.png' : './images/cam-off.png';
});

document.getElementById('prep-microphone-toggle-button').addEventListener('click', () => {
    isAudioEnabled = !isAudioEnabled;
    previewStream.getAudioTracks()[0].enabled = isAudioEnabled;

    const micImg = document.getElementById('prep-mic-img');
    micImg.src = isAudioEnabled ? './images/mic-on.png' : './images/mic-off.png';
});

// 사용자 이름을 설정하고 방에 입장하는 로직
document.getElementById('start-conference-button').addEventListener('click', async () => {
    const usernameInput = document.getElementById('username-input');
    username = usernameInput.value.trim();
    
    if (!username) {
        alert('Please enter your name');
        return;
    }

    document.getElementById('preparation-container').style.display = 'none';
    showVideoConference();

    localStream = previewStream;
    document.getElementById('local-video').srcObject = localStream;

    document.getElementById('local-nickname').textContent = username;

    if (!roomId) {
        roomId = prompt('Enter Room ID') || 'defaultRoom';
    }
    joinRoom(roomId, username);
});

document.getElementById('invite-button').addEventListener('click', () => {
    if (!roomId) {
        alert('Please join or create a room first.');
        return;
    }
    const inviteUrl = `${window.location.origin}${window.location.pathname}?roomId=${roomId}`;
    
    navigator.clipboard.writeText(inviteUrl).then(() => {
        alert('초대 링크가 클립보드에 복사되었습니다: ' + inviteUrl);
    }).catch(err => {
        console.error('텍스트 복사 실패: ', err);
        alert('초대 링크를 클립보드에 복사하는 데 실패했습니다.');
    });

    //eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
});

document.getElementById('chat-button').addEventListener('click', () => {
    const chatContainer = document.getElementById('chat-container');
    chatContainer.classList.toggle('show');
});

document.getElementById('close-chat-button').addEventListener('click', () => {
    const chatContainer = document.getElementById('chat-container');
    chatContainer.classList.remove('show');
});

document.getElementById('send-chat-button').addEventListener('click', sendMessage);

document.getElementById('chat-input').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const messageInput = document.getElementById('chat-input');
    const message = messageInput.value.trim();
    if (message !== "") {
        // 서버로 메시지 전송
        socket.emit('chat_message', {
            roomId: roomId,
            sender: username,  // 사용자 이름 포함
            message: message
        });

        // 입력 필드 초기화
        messageInput.value = '';
    }
}

socket.on('chat_message', (data) => {
    if(data.sender !== userId)
        addMessageToChat(data.sender, data.message);
});

function addMessageToChat(sender, message) {
    const chatMessages = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');
    messageElement.innerHTML = `<strong>${sender}:</strong> ${message}`;
    chatMessages.appendChild(messageElement);

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

let audioTrackEnabled = true;
let audioProcessor = null;
let audioContext = null;
let audioInput = null;
let streamInterval = null;

let videoTrackEnabled = true;

document.getElementById('camera-toggle-button').addEventListener('click', () => {
    videoTrackEnabled = !videoTrackEnabled;
    localStream.getVideoTracks()[0].enabled = videoTrackEnabled;

    const cam = document.getElementById('cam-img');
    cam.src = videoTrackEnabled ? "./images/cam-on.png" : './images/cam-off.png';
});

document.getElementById('microphone-toggle-button').addEventListener('click', () => {
    audioTrackEnabled = !audioTrackEnabled;
    localStream.getAudioTracks()[0].enabled = audioTrackEnabled;

    const mic = document.getElementById('mic-img');
    mic.src = audioTrackEnabled ? "./images/mic-on.png" : './images/mic-off.png';
});

function addMessageToChat(sender, message) {
    const chatMessages = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');
    messageElement.innerHTML = `<strong>${sender}:</strong> ${message}`;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 종료 버튼 이벤트 리스너 추가
document.getElementById('end-call-button').addEventListener('click', () => {
    stopRecording();
    leaveRoom();
});

async function leaveRoom() {
    // PeerConnection을 닫고, 스트림을 종료
    for (const clientId in peerConnections) {
        if (peerConnections[clientId]) {
            // PeerConnection 닫기
            peerConnections[clientId].close();
            delete peerConnections[clientId];

            // 해당 사용자의 비디오 요소 제거
            const videoElement = document.getElementById(clientId);
            if (videoElement) {
                videoElement.remove();
                console.log(`Removed video element for ${clientId}`);
            }
        }
    }

    // 로컬 비디오 스트림 종료
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localVideoComponent.srcObject = null;
        console.log('Local stream stopped and video element cleared');
    }

    // 서버에 방을 떠났음을 알림
    socket.emit('leave-room', roomId);
    roomId = null;

    // 비디오 채팅 UI를 숨기고, 방 선택 UI를 다시 표시
    videoChatContainer.style.display = 'none';
    roomSelectionContainer.style.display = 'flex';
}

socket.on('client_left', (clientId) => {
    // 다른 클라이언트가 방을 떠날 때 해당 사용자의 비디오 제거
    const videoElement = document.getElementById(clientId);
    if (videoElement) {
        videoElement.remove();
        console.log(`Removed video element for ${clientId}`);
    }
    delete peerConnections[clientId];
});

socket.on('client_left', (clientId) => {
    const videoElement = document.getElementById(clientId);
    if (videoElement) {
        videoElement.remove();
        console.log(`Removed video element for ${clientId}`);
    }

    delete peerConnections[clientId];
    delete clientUsernames[clientId];

    adjustVideoLayout();
});

socket.on('client_disconnected', (clientId) => {
    console.log(`Client ${clientId} disconnected`);
    removeVideoElement(clientId);
    delete clientUsernames[clientId]; 
});

let mediaRecorder;
let audioChunks = [];
let intervalId = null;

async function startRecording() {
    console.log(MediaRecorder.isTypeSupported('audio/webm;codecs=opus')); // true면 WEBM_OPUS 지원
    console.log(MediaRecorder.isTypeSupported('audio/wav')); // true면 WAV 지원

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (event) => {
            const audioBlob = event.data;
            console.log(audioBlob.type); // MIME 타입 출력
        };

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            // Blob 형태로 음성 데이터를 병합하여 변환 후 텍스트 추가
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await analyzeAudio(audioBlob);
            audioChunks = []; // 새로운 녹음을 위해 비워줌
        };

        mediaRecorder.start(); // 녹음 시작

        // 10초마다 녹음 중지 후 변환, 그리고 다시 녹음 시작
        intervalId = setInterval(() => {
            if (mediaRecorder.state === "recording") {
                mediaRecorder.stop(); // 30초마다 변환을 위해 중지
                mediaRecorder.start(); // 중지 후 다시 녹음 시작
            }
        }, 10000); // 10초마다
    } catch (err) {
        console.error('음성 녹음 중 오류 발생:', err);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop(); // 마지막으로 변환 처리
        clearInterval(intervalId); // 30초 주기 처리 중단
    }
}

// Google Speech-to-Text로 오디오 파일 분석
async function analyzeAudio(audioBlob) {
    const apiKey = '';
    const url = `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`;

    try {
        const reader = new FileReader();
        reader.readAsArrayBuffer(audioBlob);
        reader.onloadend = async function () {
            const arrayBuffer = reader.result;
            const base64Audio = btoa(
                new Uint8Array(arrayBuffer).reduce(
                    (data, byte) => data + String.fromCharCode(byte),
                    ''
                )
            );

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    config: {
                        encoding: 'WEBM_OPUS',
                        sampleRateHertz: 48000,
                        languageCode: 'ko-KR',
                    },
                    audio: {
                        content: base64Audio,
                    },
                }),
            });

            const result = await response.json();
            if (result.results && result.results.length > 0) {
                const transcript = result.results[0].alternatives[0].transcript;
                appendToTranscription(transcript);

                socket.emit('transcription', {
                    roomId: roomId,
                    senderId: userId,
                    senderName: username,
                    transcript: transcript
                });
            } else {
                console.log('텍스트 변환 실패');
            }
        };
    } catch (e) {
        console.error('텍스트 변환 중 오류 발생:', e);
    }
}

// 탭 전환 로직
document.getElementById('chat-tab-button').addEventListener('click', () => {
    document.getElementById('chat-messages-container').style.display = 'block'; // 채팅 메시지 표시
    document.getElementById('chat-input-container').style.display = 'flex';
    document.getElementById('ai-analysis-container').style.display = 'none'; // AI 분석 결과 숨기기
});

document.getElementById('ai-tab-button').addEventListener('click', () => {
    document.getElementById('chat-messages-container').style.display = 'none'; // 채팅 메시지 숨기기
    document.getElementById('chat-input-container').style.display = 'none';
    document.getElementById('ai-analysis-container').style.display = 'block'; // AI 분석 결과 표시
});
