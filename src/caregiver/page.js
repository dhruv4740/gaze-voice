// Caregiver phone page: shows what the patient says, requests, fatigue, and emergency alerts.
const $ = (id) => document.getElementById(id);
const relayUrl = new URLSearchParams(location.search).get('relay') || `ws://${location.hostname}:8787`;
let audio = null;

const fmt = (t) => new Date(t || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function beep() {
  if (!audio) return;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = 'square'; o.frequency.value = 880;
  o.connect(g); g.connect(audio.destination);
  g.gain.setValueAtTime(0.3, audio.currentTime);
  o.start(); o.stop(audio.currentTime + 0.25);
}

let alarm = null;
function showAlert(t) {
  $('alert').hidden = false;
  $('alert-time').textContent = fmt(t);
  const pulse = () => { beep(); navigator.vibrate?.([400, 200, 400, 200, 400]); };
  pulse();
  clearInterval(alarm);
  alarm = setInterval(pulse, 1500);
}
$('dismiss').onclick = () => { $('alert').hidden = true; clearInterval(alarm); navigator.vibrate?.(0); };
$('enable').onclick = () => {
  audio = audio || new (window.AudioContext || window.webkitAudioContext)();
  audio.resume(); beep(); navigator.vibrate?.(100);
  $('enable').hidden = true;
};

function addLine(text, t) {
  const d = document.createElement('div');
  d.className = 'line';
  const time = document.createElement('time');
  time.textContent = fmt(t);
  d.append(time, text);
  $('feed').prepend(d);
}

function addCard(text, t, cls = '') {
  const d = document.createElement('div');
  d.className = `card ${cls}`;
  const s = document.createElement('span');
  s.textContent = `${text} · ${fmt(t)}`;
  const b = document.createElement('button');
  b.textContent = 'Done';
  b.onclick = () => d.remove();
  d.append(s, b);
  $('requests').prepend(d);
  navigator.vibrate?.(200);
  beep();
}

function handle(m) {
  const stale = Date.now() - (m.t || 0) > 30000; // replayed history: feed only, no alarm
  if (m.type === 'spoken') addLine(`${m.text}${m.lang ? ` (${m.lang})` : ''}`, m.t);
  else if (m.type === 'rest') addLine(m.resting ? 'Patient is resting' : 'Patient is awake', m.t);
  else if (m.type === 'emergency') { if (!stale) showAlert(m.t); addLine('EMERGENCY', m.t); }
  else if (stale) return;
  else if (m.type === 'request') addCard(m.label || m.kind, m.t);
  else if (m.type === 'fatigue') addCard(`Patient may be tired (${m.level})`, m.t, 'fatigue');
}

function connect() {
  const ws = new WebSocket(relayUrl);
  ws.onopen = () => { $('conn').textContent = 'live'; $('conn').className = 'on'; };
  ws.onmessage = (e) => { try { handle(JSON.parse(e.data)); } catch { /* ignore bad frame */ } };
  ws.onclose = () => { $('conn').textContent = 'reconnecting…'; $('conn').className = 'off'; setTimeout(connect, 1500); };
}
connect();
