// Tiny WebSocket relay: the patient page sends events, caregiver phones receive them.
// Run: npm run relay   (port 8787, or PORT=...). Credit: ws (MIT).
import { WebSocketServer } from 'ws';
import http from 'node:http';
import os from 'node:os';

const PORT = Number(process.env.PORT) || 8787;
const HISTORY = 50;
const history = [];

const lanIps = () => Object.values(os.networkInterfaces()).flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address)
  .filter((a) => !/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a)); // skip VPN/Tailscale (CGNAT) addresses

// HTTP side: the patient page asks for the laptop's LAN address to build the QR code
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ips: lanIps(), port: PORT }));
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
