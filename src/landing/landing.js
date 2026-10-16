// Gaze Voice Landing & Pitch Presentation Interactivity
import './landing.css';

document.addEventListener('DOMContentLoaded', () => {
  // Smooth scrolling for nav anchors
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId && targetId !== '#') {
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });

  // Interactive Speed Proof Calculator
  const phraseInput = document.getElementById('calc-phrase');
  const letterCountEl = document.getElementById('calc-letter-count');
  const letterTimeEl = document.getElementById('calc-letter-time');
  const gazeTimeEl = document.getElementById('calc-gaze-time');
  const speedupEl = document.getElementById('calc-speedup');

  function updateProofCalc() {
    if (!phraseInput) return;
    const text = phraseInput.value.trim() || 'I need my medication now';
    const letters = text.length;
    // Standard switch-scanning AAC keyboard averages ~1.5s per character selection
    const letterSeconds = (letters * 1.5).toFixed(1);
    // Gaze Voice: 1 glance dwell selection of an AI-predicted full sentence
    const gazeSeconds = (1.2).toFixed(1);
    const speedup = Math.max(1, Math.round(letterSeconds / gazeSeconds));

    if (letterCountEl) letterCountEl.textContent = `${letters} chars`;
    if (letterTimeEl) letterTimeEl.textContent = `${letterSeconds}s`;
    if (gazeTimeEl) gazeTimeEl.textContent = `${gazeSeconds}s`;
    if (speedupEl) speedupEl.textContent = `${speedup}x`;
  }

  if (phraseInput) {
    phraseInput.addEventListener('input', updateProofCalc);
    updateProofCalc();
  }
});
