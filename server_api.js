// server_api.js
// WebSocket server with API key auth + simple REST API for key management.
// REST: POST /keys -> {key: 'generated'}, GET /keys -> list, DELETE /keys/{key}
// Note: Keys stored in memory for simplicity; persist to file/db for production.

const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 8080;
const REST_PORT = process.env.REST_PORT || 8081;
const OUT_DIR = process.env.OUT_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// In-memory keys (load from file if exists)
const KEYS_FILE = path.join(__dirname, 'keys.json');
let ALLOWED_KEYS = [];
try {
  if (fs.existsSync(KEYS_FILE)) {
    ALLOWED_KEYS = JSON.parse(fs.readFileSync(KEYS_FILE));
  }
} catch(e){ console.warn('Failed load keys', e); ALLOWED_KEYS = []; }

function saveKeys(){ fs.writeFileSync(KEYS_FILE, JSON.stringify(ALLOWED_KEYS)); }

// Simple CSV writer for EVS records
function csvLineFromObj(obj) {
  const ts = obj.ts || new Date().toISOString();
  const engine = obj.engine || '';
  const vehicleId = obj.vehicleId || '';
  const speed = obj.speed || '';
  const soc = obj.soc || '';
  const batteryVoltage = obj.batteryVoltage || '';
  const motorRPM = obj.motorRPM || '';
  const gps = obj.gps ? JSON.stringify(obj.gps) : '';
  const charging = obj.charging ? JSON.stringify(obj.charging) : '';
  const extra = obj.extra ? JSON.stringify(obj.extra).replace(/"/g,'""') : '';
  return `${ts},${engine},${vehicleId},${speed},${soc},${batteryVoltage},${motorRPM},"${gps}","${charging}","${extra}"`;
}
function getDailyFile() {
  const d = new Date().toISOString().slice(0,10);
  const fname = path.join(OUT_DIR, `fluxmos_evs_${d}.csv`);
  const exists = fs.existsSync(fname);
  if (!exists) {
    fs.appendFileSync(fname, 'ts,engine,vehicleId,speed,soc,batteryVoltage,motorRPM,gps,charging,extra\n');
  }
  return fname;
}

// REST API for key management
const app = express();
app.use(bodyParser.json());

app.get('/keys', (req,res)=>{ res.json(ALLOWED_KEYS); });
app.post('/keys', (req,res)=>{
  const key = uuidv4();
  ALLOWED_KEYS.push(key);
  saveKeys();
  res.json({key});
});
app.delete('/keys/:key', (req,res)=>{
  const k = req.params.key;
  ALLOWED_KEYS = ALLOWED_KEYS.filter(x=>x!==k);
  saveKeys();
  res.json({deleted:k});
});

app.listen(REST_PORT, ()=>console.log(`[Fluxmos REST] Key management API running on ${REST_PORT}`));

// WebSocket server for telemetry (auth via ?key=...)
const wss = new WebSocket.Server({ port: PORT }, ()=>console.log(`[Fluxmos WS] listening on ${PORT}`));

wss.on('connection', function connection(ws, req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const key = url.searchParams.get('key') || '';
  if (ALLOWED_KEYS.length && !ALLOWED_KEYS.includes(key)) {
    console.log('[Fluxmos] rejected connection, invalid key', key);
    try { ws.close(1008, 'invalid api key'); } catch(e){}
    return;
  }
  const addr = req.socket.remoteAddress + ':' + req.socket.remotePort;
  console.log(`[Fluxmos EVS] client connected: ${addr} key=${key}`);
  ws.on('message', function incoming(message) {
    try {
      const s = message.toString();
      const lines = s.split('\\n').filter(Boolean);
      const fname = getDailyFile();
      const append = [];
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          append.push(csvLineFromObj(obj));
        } catch (e) {
          append.push(line.replace(/"/g,'""'));
        }
      }
      if (append.length) {
        fs.appendFile(fname, append.join('\\n') + '\\n', (err)=>{ if(err) console.error('Write error', err); });
      }
    } catch(err) {
      console.warn('Failed to process message', err);
    }
  });

  ws.on('close', ()=>console.log(`[Fluxmos EVS] client disconnected: ${addr}`));
  ws.on('error', (e)=>console.warn('[Fluxmos EVS] ws error', e));
});

