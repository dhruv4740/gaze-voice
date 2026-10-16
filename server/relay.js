// Tiny WebSocket relay: the patient page sends events, caregiver phones receive them.
// Run: npm run relay   (port 8787, or PORT=...). Credit: ws (MIT).
import { WebSocketServer } from 'ws';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT) || 8787;
const HISTORY = 50;
const history = [];

const lanIps = () => Object.values(os.networkInterfaces()).flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address)
  .filter((a) => !/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a)); // skip VPN/Tailscale (CGNAT) addresses

// HTTP side: /relay-info gives the laptop's LAN address (QR code); everything else is the built app
// from dist/ (one service for Railway/Render). Without a dist/ build every other path answers the same JSON.
const DIST = path.resolve(import.meta.dirname, '..', 'dist');
const hasDist = fs.existsSync(path.join(DIST, 'index.html'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.woff2': 'font/woff2', '.map': 'application/json' };
const info = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ips: lanIps(), port: PORT }));
};
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.statusCode = 400; return res.end('bad request'); }
  if (!hasDist || pathname === '/relay-info' || pathname === '/relay') return info(res);
  let file = path.join(DIST, pathname.endsWith('/') ? pathname + 'index.html' : pathname);
  if (!file.startsWith(DIST + path.sep) && file !== DIST) { res.statusCode = 403; return res.end('forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    if (pathname.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    fs.createReadStream(file).pipe(res);
  });
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  for (const m of history) ws.send(m); // late joiners see recent events
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;
    msg.t = msg.t || Date.now();
    const out = JSON.stringify(msg);
    history.push(out);
    if (history.length > HISTORY) history.shift();
    for (const c of wss.clients) if (c !== ws && c.readyState === 1) c.send(out);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`relay on :${PORT}`);
  for (const ip of lanIps()) console.log(`  phone page: http://${ip}:5173/caregiver.html`);
});
