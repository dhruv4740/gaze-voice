// Patient side: forwards aac:* / gaze:fatigue window events to the relay and shows a QR code
// of the caregiver phone URL. Frames/video never go through here, only short text events.
import QRCode from 'qrcode';

const RELAY_PORT = 8787;

export function startCaregiverLink({ ui }) {
  const relayUrl = new URLSearchParams(location.search).get('relay') || `ws://${location.hostname}:${RELAY_PORT}`;
  let ws = null;
  const queue = [];

  const send = (msg) => {
    msg.t = Date.now();
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
    else if (queue.push(msg) > 20) queue.shift();
  };
  const connect = () => {
    try { ws = new WebSocket(relayUrl); } catch { return; }
    ws.onopen = () => { while (queue.length) ws.send(JSON.stringify(queue.shift())); };
    ws.onclose = () => setTimeout(connect, 3000);
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type !== 'question' || Date.now() - (m.t || 0) > 30000) return; // relay history replay: ignore old
      const text = String(m.text || '').trim().slice(0, 300);
      if (!text) return;
      window.dispatchEvent(new CustomEvent('aac:heard', { detail: { text, from: 'phone' } })); // wakes a manual rest
      window.dispatchEvent(new CustomEvent('aac:remote-question', { detail: { text, from: m.from || 'caregiver' } }));
      if (m.speak && 'speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    };
    ws.onerror = () => { /* relay not running: events are queued, retried on close */ };
  };
  connect();

  window.addEventListener('aac:spoken', (e) => send({ type: 'spoken', text: e.detail?.text, lang: e.detail?.lang }));
  window.addEventListener('aac:emergency', () => send({ type: 'emergency' }));
  window.addEventListener('aac:request', (e) => send({ type: 'request', kind: e.detail?.kind, label: e.detail?.label }));
  window.addEventListener('gaze:rest', (e) => send({ type: 'rest', resting: !!e.detail?.resting }));
  window.addEventListener('gaze:fatigue', (e) => send({ type: 'fatigue', level: e.detail?.level }));

  // QR button: asks the relay for the laptop's LAN IP, then draws the phone URL
  const btn = document.createElement('button');
  btn.textContent = 'Caregiver QR';
  const box = document.createElement('div');
  box.id = 'caregiver-qr';
  box.hidden = true;
  btn.onclick = async () => {
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false;
    box.textContent = 'loading…';
    try {
      const info = await (await fetch(`http://${location.hostname}:${RELAY_PORT}/`)).json();
      const ip = info.ips[0];
      if (!ip) throw new Error('no LAN address');
      const phoneUrl = `http://${ip}:${location.port || 80}/caregiver.html?relay=ws://${ip}:${info.port}`;
      const canvas = document.createElement('canvas');
      await QRCode.toCanvas(canvas, phoneUrl, { width: 180, margin: 1 });
      const label = document.createElement('div');
      label.textContent = phoneUrl;
      box.replaceChildren(canvas, label);
    } catch {
      box.textContent = 'Relay not running: npm run relay';
    }
  };
  ui.append(btn, box);
  return { send };
}
