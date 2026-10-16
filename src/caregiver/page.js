// Caregiver phone page: shows what the patient says, requests, fatigue, and emergency alerts.
const $ = (id) => document.getElementById(id);
const relayUrl = new URLSearchParams(location.search).get('relay') || `ws://${location.hostname}:8787`;
let audio = null;
// vibrate only after a tap: Chrome logs a blocked-call error otherwise
const vibrate = (p) => { if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(p); };

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
  const pulse = () => { beep(); vibrate([400, 200, 400, 200, 400]); };
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
  vibrate(200);
  beep();
}

// ask a question: typed, quick chip, or dictated; shown in the feed with the patient's reply threaded under it
const QUICK = ['Are you in pain?', 'Are you hungry?', 'Do you need the toilet?', 'Do you want to sleep?', 'How are you feeling?'];
let ws = null;
let pending = null; // the question thread still waiting for the patient's spoken reply

function addQuestion(text, t) {
  const d = document.createElement('div');
  d.className = 'line q';
  const time = document.createElement('time');
  time.textContent = `${fmt(t)} · you asked`;
  const body = document.createElement('div');
  body.textContent = text;
  const ans = document.createElement('div');
  ans.className = 'a waiting';
  ans.textContent = 'waiting for a reply…';
  d.append(time, body, ans);
  $('feed').prepend(d);
  pending = ans;
}

function ask(raw) {
  const text = String(raw || '').trim().slice(0, 300);
  if (!text) return false;
  if (!ws || ws.readyState !== 1) { $('conn').textContent = 'not connected: try again'; return false; }
  const t = Date.now();
  ws.send(JSON.stringify({ type: 'question', text, from: 'caregiver', speak: $('speak').checked, t }));
  addQuestion(text, t);
  return true;
}

for (const q of QUICK) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = q;
  b.onclick = () => ask(q);
  $('chips').appendChild(b);
}
$('ask').onsubmit = (e) => { e.preventDefault(); if (ask($('q').value)) $('q').value = ''; };

// dictation needs SpeechRecognition and a secure context (https or localhost); otherwise typing only
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR && window.isSecureContext) {
  $('mic').hidden = false;
  $('mic').onclick = () => {
    const rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = false;
    $('mic').classList.add('on');
    rec.onresult = (e) => { $('q').value = e.results[0][0].transcript; $('q').focus(); };
    rec.onend = rec.onerror = () => $('mic').classList.remove('on');
    try { rec.start(); } catch { $('mic').classList.remove('on'); }
  };
}

function handle(m) {
  const stale = Date.now() - (m.t || 0) > 30000; // replayed history: feed only, no alarm
  if (m.type === 'spoken') {
    const text = `${m.text}${m.lang ? ` (${m.lang})` : ''}`;
    if (pending && !stale) { pending.textContent = `${fmt(m.t)} · patient: ${text}`; pending.classList.remove('waiting'); pending = null; }
    else addLine(text, m.t);
  }
  else if (m.type === 'rest') addLine(m.resting ? 'Patient is resting' : 'Patient is awake', m.t);
  else if (m.type === 'emergency') { if (!stale) showAlert(m.t); addLine('EMERGENCY', m.t); }
  else if (stale) return;
  else if (m.type === 'request') addCard(m.label || m.kind, m.t);
  else if (m.type === 'fatigue') addCard(`Patient may be tired (${m.level})`, m.t, 'fatigue');
}

function connect() {
  ws = new WebSocket(relayUrl);
  ws.onopen = () => { $('conn').textContent = 'live'; $('conn').className = 'on'; };
  ws.onmessage = (e) => { try { handle(JSON.parse(e.data)); } catch { /* ignore bad frame */ } };
  ws.onclose = () => { $('conn').textContent = 'reconnecting…'; $('conn').className = 'off'; setTimeout(connect, 1500); };
}
connect();
