const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ─── Estado global ────────────────────────────────────────────────────────────
const BASE_PORT = 3000;
const REMOTE_PORT = 3100;  // Panel remoto red local
let outputs = [];
let outputIdCounter = 1;
let projectState = { graphics: [], activeGraphics: [] };
let remoteServer = null;
let remoteClients = new Set();
let activeTunnel = null; // Túnel público activo

// ─── IP local ─────────────────────────────────────────────────────────────────
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

// ─── Puerto disponible ────────────────────────────────────────────────────────
async function findAvailablePort(startPort) {
  const net = require('net');
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(startPort, '0.0.0.0', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', () => resolve(findAvailablePort(startPort + 1)));
  });
}

// ─── Agregar rutas del panel remoto a un Express app ─────────────────────────
function addRemoteRoutes(app) {
  app.use(express.json());

  // Panel remoto HTML
  app.get('/remote', (req, res) =>
    res.sendFile(path.join(__dirname, 'remote.html')));

  // API: estado actual
  app.get('/api/state', (req, res) => res.json(projectState));

  // API: trigger desde remoto o máquina externa
  app.post('/api/trigger', (req, res) => {
    const payload = req.body;
    if (!payload?.action) return res.status(400).json({ error: 'Inválido' });
    _applyTrigger(payload);
    res.json({ ok: true });
  });

  // API: QR info (para que el remoto sepa URLs)
  app.get('/api/info', (req, res) => {
    const ip = getLocalIP();
    res.json({
      localIP: ip,
      tunnelUrl: activeTunnel?.url || null,
      version: '1.0.0'
    });
  });
}

// ─── Crear output (Express + WS) ─────────────────────────────────────────────
async function createOutput(port, isMain = false) {
  return new Promise((resolve, reject) => {
    const app = express();
    const httpSrv = http.createServer(app);
    const wss = new WebSocket.Server({ server: httpSrv });
    const clients = new Set();
    const id = outputIdCounter++;

    // Output transparente para OBS
    app.get('/', (req, res) =>
      res.sendFile(path.join(__dirname, '..', 'output', 'output.html')));

    app.use('/output-static', express.static(path.join(__dirname, '..', 'output')));

    // Servir archivos HTML de gráficos
    app.get('/graphic-file', (req, res) => {
      const filePath = decodeURIComponent(req.query.path || '');
      if (!filePath || !fs.existsSync(filePath))
        return res.status(404).send('No encontrado');
      res.sendFile(filePath);
    });

    // Recursos relativos al gráfico
    app.use('/graphic-assets', (req, res) => {
      const base = decodeURIComponent(req.query.base || '');
      const file = req.path.slice(1);
      if (!base || !file) return res.status(400).send('Faltan parámetros');
      const full = path.join(path.dirname(base), file);
      if (!fs.existsSync(full)) return res.status(404).send('No encontrado');
      res.sendFile(full);
    });

    // El output principal también sirve el panel remoto y la API
    if (isMain) addRemoteRoutes(app);

    // WebSocket output
    wss.on('connection', (ws, req) => {
      const url = req.url || '/';

      // Distinguir clientes de output vs clientes remotos
      if (url.startsWith('/remote-ws')) {
        // Cliente del panel remoto
        remoteClients.add(ws);
        ws.send(JSON.stringify({ type: 'stateUpdate', state: projectState }));
        ws.on('close', () => remoteClients.delete(ws));
        ws.on('error', () => remoteClients.delete(ws));
        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data);
            if (msg.action) _applyTrigger(msg);
          } catch (e) {}
        });
      } else {
        // Cliente output (OBS / navegador)
        clients.add(ws);
        ws.on('close', () => clients.delete(ws));
        ws.on('error', () => clients.delete(ws));
      }
    });

    httpSrv.listen(port, '0.0.0.0', () => {
      console.log(`[Output ${id}] http://localhost:${port}`);
      resolve({ id, port, app, server: httpSrv, wss, clients, isMain });
    });

    httpSrv.on('error', (err) => {
      if (err.code === 'EADDRINUSE') reject(new Error(`Puerto ${port} en uso`));
      else reject(err);
    });
  });
}

// ─── Servidor remoto dedicado (red local) ────────────────────────────────────
async function startRemoteServer() {
  const port = await findAvailablePort(REMOTE_PORT);
  return new Promise((resolve) => {
    const app = express();
    const httpSrv = http.createServer(app);
    const wss = new WebSocket.Server({ server: httpSrv, path: '/remote-ws' });

    addRemoteRoutes(app);
    // También servir output en el remoto para pruebas
    app.get('/', (req, res) =>
      res.sendFile(path.join(__dirname, 'remote.html')));

    wss.on('connection', (ws) => {
      remoteClients.add(ws);
      ws.send(JSON.stringify({ type: 'stateUpdate', state: projectState }));
      ws.on('close', () => remoteClients.delete(ws));
      ws.on('error', () => remoteClients.delete(ws));
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          if (msg.action) _applyTrigger(msg);
        } catch (e) {}
      });
    });

    httpSrv.listen(port, '0.0.0.0', () => {
      const ip = getLocalIP();
      console.log(`[Panel Remoto] http://${ip}:${port}`);
      remoteServer = { server: httpSrv, wss, port };
      resolve({ port, ip, url: `http://${ip}:${port}` });
    });

    httpSrv.on('error', (err) => {
      console.warn('[Panel Remoto] No pudo iniciarse:', err.message);
      resolve({ port: null, url: null });
    });
  });
}

// ─── Túnel público (acceso desde cualquier red) ───────────────────────────────
async function startTunnel(port, subdomain = null) {
  try {
    // Detener túnel previo si existe
    if (activeTunnel) await stopTunnel();

    const localtunnel = require('localtunnel');
    const opts = { port };
    if (subdomain) opts.subdomain = subdomain;

    const tunnel = await localtunnel(opts);
    activeTunnel = { tunnel, url: tunnel.url, port };

    console.log(`[Túnel] Público: ${tunnel.url}`);
    console.log(`[Túnel] → OBS usa: ${tunnel.url}`);
    console.log(`[Túnel] → Remoto: ${tunnel.url}/remote`);

    tunnel.on('close', () => {
      console.log('[Túnel] Cerrado');
      activeTunnel = null;
    });

    tunnel.on('error', (err) => {
      console.error('[Túnel] Error:', err.message);
    });

    return {
      ok: true,
      url: tunnel.url,
      outputUrl: tunnel.url,
      remoteUrl: `${tunnel.url}/remote`
    };
  } catch (e) {
    console.error('[Túnel] No pudo iniciarse:', e.message);
    return { ok: false, error: e.message };
  }
}

async function stopTunnel() {
  if (!activeTunnel) return { ok: false, error: 'Sin túnel activo' };
  try {
    activeTunnel.tunnel.close();
    activeTunnel = null;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Aplicar trigger ──────────────────────────────────────────────────────────
function _applyTrigger(payload) {
  broadcast(payload);
  if (payload.action === 'show') {
    if (!projectState.activeGraphics.includes(payload.graphicId))
      projectState.activeGraphics.push(payload.graphicId);
  } else if (payload.action === 'hide') {
    projectState.activeGraphics = projectState.activeGraphics.filter(id => id !== payload.graphicId);
  } else if (payload.action === 'hideAll') {
    projectState.activeGraphics = [];
  }
  _notifyRemotes();
}

function _notifyRemotes() {
  const msg = JSON.stringify({ type: 'stateUpdate', state: projectState });
  remoteClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

// ─── API Pública ──────────────────────────────────────────────────────────────
async function startServer() {
  const port = await findAvailablePort(BASE_PORT);
  const output = await createOutput(port, true); // isMain=true → incluye rutas remotas
  outputs.push(output);
  const remote = await startRemoteServer();
  return { port, remote };
}

function stopServer() {
  if (activeTunnel) stopTunnel().catch(() => {});
  outputs.forEach(({ server, wss }) => { wss.close(); server.close(); });
  outputs = [];
  if (remoteServer) { remoteServer.wss.close(); remoteServer.server.close(); remoteServer = null; }
}

async function addOutput() {
  if (!outputs.length) return { ok: false, error: 'Servidor no iniciado' };
  const newPort = await findAvailablePort(outputs[outputs.length - 1].port + 1);
  try {
    const output = await createOutput(newPort, false);
    outputs.push(output);
    return { ok: true, id: output.id, port: newPort, url: `http://localhost:${newPort}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function removeOutput(outputId) {
  const idx = outputs.findIndex(o => o.id === outputId);
  if (idx === -1) return { ok: false, error: 'No encontrado' };
  if (outputs.length === 1) return { ok: false, error: 'No se puede eliminar el único output' };
  const out = outputs[idx];
  out.wss.close(); out.server.close();
  outputs.splice(idx, 1);
  return { ok: true };
}

function broadcast(payload) {
  const targets = payload.outputId
    ? outputs.filter(o => o.id === payload.outputId)
    : outputs;
  const msg = JSON.stringify(payload);
  targets.forEach(({ clients }) => {
    clients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
  });
}

function syncProjectState(newState) {
  projectState = { ...projectState, ...newState };
  _notifyRemotes();
}

function getTunnelStatus() {
  if (!activeTunnel) return null;
  return {
    url: activeTunnel.url,
    outputUrl: activeTunnel.url,
    remoteUrl: `${activeTunnel.url}/remote`,
    port: activeTunnel.port
  };
}

function getStatus() {
  const ip = getLocalIP();
  return {
    outputs: outputs.map(o => ({
      id: o.id, port: o.port,
      url: `http://localhost:${o.port}`,
      clients: o.clients.size
    })),
    remote: remoteServer
      ? { url: `http://${ip}:${remoteServer.port}`, ip, port: remoteServer.port }
      : null,
    tunnel: getTunnelStatus(),
    localIP: ip
  };
}

module.exports = {
  startServer, stopServer, addOutput, removeOutput,
  broadcast, getStatus, syncProjectState,
  startTunnel, stopTunnel, getTunnelStatus
};
