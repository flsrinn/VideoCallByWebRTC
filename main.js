const { app, BrowserWindow } = require('electron');
const path = require('path');
const server = require('./server'); // 서버 파일 불러오기 

let mainWindow;

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('ready', () => {
    server.startServer(); // 서버 시작

    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true, // remote module 활성화 (필요한 경우)
            sandbox: false,
        }
    });

    mainWindow.loadURL(`https://7637-223-194-138-218.ngrok-free.app`); // 서버에서 제공하는 URL을 로드
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
});
