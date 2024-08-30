// Listen for the client_disconnected event
socket.on('client_disconnected', (clientId) => {
    console.log(`Client ${clientId} disconnected`);
    removeVideoElement(clientId);
});

// Function to remove video element and adjust layout
function removeVideoElement(clientId) {
    const videoElement = document.getElementById(clientId);
    if (videoElement) {
        videoElement.remove();
        adjustVideoLayout();
    }
}

// Adjust the video layout when videos are added or removed
function adjustVideoLayout() {
    const videoContainer = document.getElementById('video-chat-container');
    const videos = videoContainer.getElementsByTagName('video');
    const videoCount = videos.length;

    switch(videoCount) {
        case 1:
            videoContainer.style.gridTemplateColumns = '1fr';
            break;
        case 2:
            videoContainer.style.gridTemplateColumns = 'repeat(2, 1fr)';
            break;
        case 3:
            videoContainer.style.gridTemplateColumns = 'repeat(3, 1fr)';
            break;
        case 4:
            videoContainer.style.gridTemplateColumns = 'repeat(2, 1fr)';
            videoContainer.style.gridTemplateRows = 'repeat(2, 1fr)';
            break;
        default:
            videoContainer.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
            videoContainer.style.gridTemplateRows = 'none';
            break;
    }
}

// Add video element function already defined in your code
function addVideoElement(clientId, stream) {
    const videoContainer = document.getElementById('video-chat-container');
    const videoElement = document.createElement('video');
    
    videoElement.id = clientId;
    videoElement.srcObject = stream;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    
    videoContainer.appendChild(videoElement);
    adjustVideoLayout();
}

document.getElementById('end-call-button').addEventListener('click', () => {
    // Disconnect from the socket
    socket.disconnect();

    // Optionally close the video stream
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    // Close the window (works for Electron apps)
    if (typeof window !== 'undefined') {
        window.close();
    }
});
