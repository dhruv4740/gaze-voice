// Web Audio API emergency alarm and modal coordinator

let audioCtx = null;
let oscillator = null;
let gainNode = null;
let alarmInterval = null;
let isToneHigh = false;

function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

export function startEmergencyAlarm() {
  initAudio();
  if (!audioCtx) return;

  stopEmergencyAlarm(); // ensure clean slate

  try {
    oscillator = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5

    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();

    // Alternate between high and low pitch (two-tone emergency siren)
    alarmInterval = setInterval(() => {
      if (!audioCtx || !oscillator) return;
      isToneHigh = !isToneHigh;
      const freq = isToneHigh ? 960 : 720;
      oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
    }, 280);
  } catch (err) {
    console.error('Error starting emergency audio:', err);
  }
}

export function stopEmergencyAlarm() {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
  if (oscillator) {
    try {
      oscillator.stop();
      oscillator.disconnect();
    } catch (e) {
      // ignore
    }
    oscillator = null;
  }
  if (gainNode) {
    try {
      gainNode.disconnect();
    } catch (e) {
      // ignore
    }
    gainNode = null;
  }
}
