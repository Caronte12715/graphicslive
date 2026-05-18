const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const { startServer, stopServer, broadcast } = require('./server/server');

let mainWindow = null;
const isDev = process.argv.includes('--dev');

// ─── Crear ventana principal (Control Panel) ─────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0d0d0f',
    title: 'Orbit',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0d0d0f',
      symbolColor: '#e0e0e0',
      height: 38
    },
    icon: path.join(__dirname, 'assets', 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App Ready ────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Suprimir menú por defecto
  Menu.setApplicationMenu(null);

  // Iniciar servidor Express + WebSocket
  const serverInfo = await startServer();
  console.log(`[Orbit] Servidor iniciado en puerto ${serverInfo.port}`);

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// Obtener estado del servidor (puerto, outputs activos)
ipcMain.handle('server:status', () => {
  const { getStatus } = require('./server/server');
  return getStatus();
});

// Sincronizar estado del proyecto con panel remoto
ipcMain.handle('project:sync', (event, projectData) => {
  const { syncProjectState } = require('./server/server');
  syncProjectState(projectData);
  return { ok: true };
});

// Iniciar túnel público
ipcMain.handle('tunnel:start', async (event, subdomain) => {
  const { startTunnel, getStatus } = require('./server/server');
  const status = getStatus();
  const port = status.outputs[0]?.port;
  if (!port) return { ok: false, error: 'Servidor no iniciado' };
  return startTunnel(port, subdomain || null);
});

// Detener túnel
ipcMain.handle('tunnel:stop', async () => {
  const { stopTunnel } = require('./server/server');
  return stopTunnel();
});

// Estado del túnel
ipcMain.handle('tunnel:status', () => {
  const { getTunnelStatus } = require('./server/server');
  return getTunnelStatus();
});

// Disparar gráfico (mostrar/ocultar) en uno o todos los outputs
ipcMain.handle('graphic:trigger', (event, payload) => {
  broadcast(payload);
  return { ok: true };
});

// Selector de archivos HTML para cargar gráficos
ipcMain.handle('dialog:openFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar archivos de gráficos',
    filters: [
      { name: 'Gráficos HTML', extensions: ['html'] },
      { name: 'Todos los archivos', extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  });
  return result.canceled ? [] : result.filePaths;
});

// Abrir selector para cargar un proyecto (.json)
ipcMain.handle('dialog:loadProject', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Cargar Proyecto',
    filters: [{ name: 'Proyecto Orbit', extensions: ['glproj'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const fs = require('fs');
  try {
    const data = fs.readFileSync(result.filePaths[0], 'utf-8');
    const parsedData = JSON.parse(data);
    parsedData.name = path.basename(result.filePaths[0], '.glproj');
    return { path: result.filePaths[0], data: parsedData };
  } catch (e) {
    return { error: e.message };
  }
});

// Guardar proyecto
ipcMain.handle('dialog:saveProject', async (event, projectData) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar Proyecto',
    defaultPath: `${projectData.name || 'proyecto'}.glproj`,
    filters: [{ name: 'Proyecto Orbit', extensions: ['glproj'] }]
  });
  if (result.canceled) return { ok: false };
  const fs = require('fs');
  try {
    const fileName = path.basename(result.filePath, '.glproj');
    projectData.name = fileName;
    fs.writeFileSync(result.filePath, JSON.stringify(projectData, null, 2), 'utf-8');
    return { ok: true, path: result.filePath, name: fileName };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Leer contenido de un archivo HTML (para preview/carga)
ipcMain.handle('file:readHTML', (event, filePath) => {
  const fs = require('fs');
  try {
    return { ok: true, content: fs.readFileSync(filePath, 'utf-8') };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Obtener directorio de templates incluidos en la app
ipcMain.handle('templates:list', () => {
  const fs = require('fs');
  const templatesDir = app.isPackaged
    ? path.join(process.resourcesPath, 'templates')
    : path.join(__dirname, 'templates');
  try {
    const files = fs.readdirSync(templatesDir)
      .filter(f => f.endsWith('.html'))
      .map(f => ({ name: f.replace('.html', ''), path: path.join(templatesDir, f) }));
    return files;
  } catch (e) {
    return [];
  }
});

// Abrir output en navegador externo
ipcMain.handle('output:openInBrowser', (event, url) => {
  shell.openExternal(url);
  return { ok: true };
});

// Agregar nuevo output (puerto adicional)
ipcMain.handle('output:add', async () => {
  const { addOutput } = require('./server/server');
  const result = await addOutput();
  return result;
});

// Remover output
ipcMain.handle('output:remove', async (event, outputId) => {
  const { removeOutput } = require('./server/server');
  return removeOutput(outputId);
});

// Generar QR en main process (seguro, sin CDN)
ipcMain.handle('utils:generateQR', async (event, text) => {
  try {
    const QRCode = require('qrcode');
    const dataUrl = await QRCode.toDataURL(text, {
      width: 220,
      margin: 2,
      color: {
        dark: '#1a0533',
        light: '#ffffff'
      }
    });
    return { ok: true, dataUrl };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
