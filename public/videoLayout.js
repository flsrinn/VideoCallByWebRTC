function removeVideoElement(clientId) {
    const videoWrapperId = `video-wrapper-${clientId}`;
    const videoWrapper = document.getElementById(videoWrapperId);
    if (videoWrapper) {
        videoWrapper.remove();
        adjustVideoLayout();
    }
}

function adjustVideoLayout() {
    const videoContainer = document.getElementById('video-chat-container');
    const videos = videoContainer.getElementsByTagName('video');
    const videoCount = videos.length;

    if (videoCount === 1) {
        videoContainer.style.gridTemplateColumns = '1fr';
    } else if (videoCount === 2) {
        videoContainer.style.gridTemplateColumns = 'repeat(2, 1fr)';
    } else if (videoCount === 3) {
        videoContainer.style.gridTemplateColumns = 'repeat(3, 1fr)';
    } else {
        videoContainer.style.gridTemplateColumns = 'repeat(3, 1fr)';
        videoContainer.style.gridTemplateRows = `repeat(${Math.ceil(videoCount / 3)}, 1fr)`;
    }
}

function addVideoElement(clientId, stream, username) {
    const videoContainer = document.getElementById('remote-video');
    
    // 비디오와 닉네임을 감싸는 wrapper 생성
    const videoWrapper = document.createElement('div');
    videoWrapper.className = 'video-wrapper'; // 비디오와 닉네임을 감쌀 wrapper
    videoWrapper.id = clientId;

    // 비디오 요소 생성
    const videoElement = document.createElement('video');
    videoElement.id = clientId;
    videoElement.srcObject = stream;
    videoElement.autoplay = true;
    videoElement.playsInline = true;

    // 닉네임 요소 생성
    const nicknameElement = document.createElement('div');
    nicknameElement.className = 'video-nickname';
    nicknameElement.textContent = username; // 사용자 닉네임 설정

    console.log(`Appending video and nickname for ${username} (${clientId})`);
    
    // 비디오와 닉네임을 wrapper에 추가
    videoWrapper.appendChild(videoElement);
    videoWrapper.appendChild(nicknameElement);

    // wrapper를 비디오 컨테이너에 추가
    videoContainer.appendChild(videoWrapper);

    // 비디오 레이아웃 조정
    adjustVideoLayout();
}

document.getElementById('end-call-button').addEventListener('click', () => {
    socket.disconnect();

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    if (typeof window !== 'undefined') {
        window.close();
    }
});
