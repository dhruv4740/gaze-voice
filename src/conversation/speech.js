// Speech Recognition (STT) and Speech Synthesis (TTS) engine

export class SpeechListener {
  constructor({ onTranscript, onStatusChange }) {
    this.onTranscript = onTranscript;
    this.onStatusChange = onStatusChange;
    this.recognition = null;
    this.isListening = false;
    this.shouldListen = false;
    this.isPausedForSpeech = false;
    this.resumeTimer = null;
    this.language = 'en-IN';

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this.language;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.onStatusChange?.({ isListening: true });
      };

      this.recognition.onresult = (event) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            final += res[0].transcript;
          } else {
            interim += res[0].transcript;
          }
        }

        if (final.trim()) {
          this.onTranscript?.({ text: final.trim(), isFinal: true });
        } else if (interim.trim()) {
          this.onTranscript?.({ text: interim.trim(), isFinal: false });
        }
      };

      this.recognition.onerror = (err) => {
        console.warn('Speech recognition error:', err.error);
        if (err.error === 'not-allowed') {
          this.shouldListen = false;
          this.isListening = false;
          this.onStatusChange?.({ isListening: false, error: 'Mic permission denied' });
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.onStatusChange?.({ isListening: false });
        // Auto restart if continuous listening is desired and not paused for TTS
        if (this.shouldListen && !this.isPausedForSpeech) {
          try {
            this.recognition.start();
          } catch (e) {
            // ignore
          }
        }
      };
    } else {
      console.warn('SpeechRecognition API not supported in this browser. Fallback to typed input.');
    }
  }

  setLanguage(lang) {
    this.language = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
      if (this.isListening) {
        this.stop();
        setTimeout(() => this.start(), 200);
      }
    }
  }

  pauseForSpeech() {
    this.isPausedForSpeech = true;
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
  }

  resumeAfterSpeech(delayMs = 500) {
    this.isPausedForSpeech = false;
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.resumeTimer = setTimeout(() => {
      if (this.shouldListen && !this.isPausedForSpeech && this.recognition && !this.isListening) {
        try {
          this.recognition.start();
        } catch (e) {}
      }
    }, delayMs);
  }

  start() {
    this.shouldListen = true;
    this.isPausedForSpeech = false;
    if (this.recognition && !this.isListening) {
      try {
        this.recognition.start();
      } catch (e) {
        console.warn('Failed to start speech recognition:', e);
      }
    }
  }

  stop() {
    this.shouldListen = false;
    this.isPausedForSpeech = false;
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
    }
  }

  toggle() {
    if (this.isListening) {
      this.stop();
    } else {
      this.start();
    }
  }
}

const TONE_SETTINGS = {
  urgent: { rate: 1.15, pitch: 1.1 },
  gentle: { rate: 0.9, pitch: 1.0 },
  joking: { rate: 1.0, pitch: 1.15 },
  formal: { rate: 0.95, pitch: 0.95 }
};

export function speakPhrase(text, lang = 'en-IN', { onStart, onEnd, tone = 'gentle' } = {}) {
  if (!('speechSynthesis' in window) || !text) return;

  window.speechSynthesis.cancel(); // cancel any ongoing speech

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;

  const tKey = (tone || 'gentle').toLowerCase();
  const toneConfig = TONE_SETTINGS[tKey] || { rate: 0.95, pitch: 1.0 };
  utterance.rate = toneConfig.rate;
  utterance.pitch = toneConfig.pitch;

  if (onStart) utterance.onstart = onStart;
  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }

  // Try to find matching voice
  const voices = window.speechSynthesis.getVoices();
  const targetPrefix = lang.toLowerCase().slice(0, 2);
  const voice =
    voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(targetPrefix)) ||
    voices.find((v) => v.default);

  if (!voice?.lang || (targetPrefix !== 'en' && !voice.lang.toLowerCase().startsWith(targetPrefix))) {
    // no voice for this language: an English voice would read it as noise, so skip speaking (the text is still shown)
    console.warn(`No ${lang} voice installed; not speaking.`);
    if (onEnd) onEnd();
    return;
  }
  utterance.voice = voice;

  window.speechSynthesis.speak(utterance);
}
