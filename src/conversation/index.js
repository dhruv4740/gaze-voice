// Team B (teammate) owns everything in src/conversation/.
// Implements the complete AAC conversation interface: layout, speech recognition,
// Groq & Gemini replies, speech synthesis, categories, patient profile, spell mode, emergency.
// Priority Round: Turn-based conversation rhythm (aac:heard, gaze:rest), speech pause during TTS,
// full QWERTY keyboard screen, stop/listen audio tile, deduplication.

import './conversation.css';
import { getMemory, saveMemory, logInteraction, getDailyLog, getPinnedReplies, togglePinnedReply } from './memory.js';
import { CATEGORIES, getOfflineReplies, getOfflineRoleReplies } from './categories.js';
import { predictReplies, predictWordCompletions } from './groq.js';
import { SpeechListener, speakPhrase } from './speech.js';
import { SpellEngine, LETTER_GROUPS } from './spell.js';
import { startEmergencyAlarm, stopEmergencyAlarm } from './emergency.js';
import { TOPICS, dispatchHomeRequest, getWhatsAppShareUrl } from './home.js';
import { LISTENER_LANGUAGES, translateText } from './translation.js';
import { generateDailySummary } from './summary.js';

export function startConversation(app) {
  let memory = getMemory();
  let patientLang = 'en-IN'; // patient's input language
  let listenerLang = 'en-IN'; // caregiver / listener language ('en-IN' | 'hi-IN' | 'mr-IN')
  let mode = 'chat'; // 'chat' | 'categories' | 'category_items' | 'spell' | 'type' | 'profile' | 'topics' | 'topic_items' | 'summary' | 'onboarding'
  let activeCategory = null;
  let activeTopic = null;
  let isEmergency = false;
  let isListening = false;
  let isLoadingReplies = false;
  let isLoadingSummary = false;
  let summaryReport = '';
  let heardText = 'Did you sleep well?';
  let showManualInput = false;
  let fatigueAlert = null; // 'mild' | 'high' | null
  let lastTranslation = null; // { original, translated, lang }

  // Rest state & Audio state (Turn-based rhythm)
  let isResting = false;
  let isAudioStopped = false;
  let lastUtteranceNormalized = '';

  // Stable Board & Role-Based AI State (Round 4)
  let lastSpokenText = 'Yes, I slept well.';
  let spokenHistory = ['Yes, I slept well.', 'Water with straw please.', 'Thank you.'];
  let pinnedReplies = getPinnedReplies();
  let roleReplies = getOfflineRoleReplies('Did you sleep well?', patientLang);
  let chatMounted = false;

  // Type / QWERTY Keyboard State
  let typeBuffer = '';
  let typePredictions = ['I need', 'Thank you', 'Please help', 'Water', 'Yes', 'No'];
  let typePredictionTimer = null;

  // Accessibility & Judge Demo Proof State
  let isJudgeMode = true; // Enabled for judging demo
  let isHighContrast = false;
  let isLargeText = false;
  let liveProof = null; // Speedup benchmark
  let speechDebounceTimer = null;
  let isAiRequestInFlight = false;
  let lastGazeSelectTime = 0;
  let lastGazeTarget = null;

  // Check onboarding on first run
  const isOnboarded = localStorage.getItem('gaze_voice_onboarded') === 'true';
  if (!isOnboarded) {
    mode = 'onboarding';
  }

  const history = [
    { speaker: 'other', text: 'Did you sleep well?' }
  ];

  let replies = getOfflineReplies('Did you sleep well?', patientLang);

  const spellEngine = new SpellEngine({
    onBufferChange: () => render(),
    onPredictionsChange: () => render()
  });

  // Listen for rest state from Team A's rest mode
  window.addEventListener('gaze:rest', (e) => {
    isResting = !!e.detail?.resting;
  });

  // Listen for fatigue events from Team A's gaze engine
  window.addEventListener('gaze:fatigue', (e) => {
    const level = e.detail?.level;
    if (level === 'mild' || level === 'high') {
      fatigueAlert = level;
      render();
    }
  });

  // Speech recognition listener with debouncing
  const listener = new SpeechListener({
    onTranscript: ({ text, isFinal }) => {
      heardText = text;
      if (isFinal) {
        if (speechDebounceTimer) clearTimeout(speechDebounceTimer);
        speechDebounceTimer = setTimeout(() => {
          history.push({ speaker: 'other', text });
          handleNewUtterance(text);
        }, 350);
      }
      render();
    },
    onStatusChange: (status) => {
      isListening = status.isListening;
      render();
    }
  });

  // Start listening by default (continuous)
  listener.start();

  async function handleNewUtterance(text) {
    if (!text || !text.trim()) return;

    // Filter fragments under 3 words unless ending in '?'
    const words = text.trim().split(/\s+/).filter(Boolean);
    const isQuestion = text.trim().endsWith('?');
    if (words.length < 3 && !isQuestion) {
      return;
    }

    // Dedupe identical or near-identical text
    const normalized = text.toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (normalized === lastUtteranceNormalized) {
      return;
    }
    lastUtteranceNormalized = normalized;

    // Contract event: aac:heard wakes the app!
    window.dispatchEvent(new CustomEvent('aac:heard', { detail: { text } }));
    isResting = false;

    // 1. Instant feel: immediately display offline contextual role replies (0ms delay)
    roleReplies = getOfflineRoleReplies(text, patientLang);
    isLoadingReplies = true;
    updateChatBoardInPlace();

    // 2. Throttle: ignore concurrent duplicate requests
    if (isAiRequestInFlight) return;
    isAiRequestInFlight = true;

    // 3. Fetch AI replies (Groq -> 4s Gemini fallback -> offline)
    try {
      const aiReplies = await predictReplies({
        utterance: text,
        history,
        profile: memory,
        language: patientLang
      });
      if (aiReplies && typeof aiReplies === 'object' && !isResting) {
        roleReplies = aiReplies;
      }
    } catch (err) {
      console.warn('AI prediction failed, keeping instant replies:', err);
    } finally {
      isLoadingReplies = false;
      isAiRequestInFlight = false;
      updateChatBoardInPlace();
    }
  }

  async function handleSelectPhrase(phraseText, kind = 'conversation', category = 'general') {
    if (!phraseText) return;

    // Update stable board history and repeat memory
    lastSpokenText = phraseText;
    if (!spokenHistory.includes(phraseText)) {
      spokenHistory.unshift(phraseText);
      if (spokenHistory.length > 5) spokenHistory.pop();
    }

    // Live proof calculation vs traditional letter-by-letter scanning
    const charCount = phraseText.trim().length;
    const scanningTime = (charCount * 1.5).toFixed(1);
    const gazeTime = 1.2;
    const speedup = Math.round((charCount * 1.5) / gazeTime);
    liveProof = {
      phrase: phraseText,
      chars: charCount,
      scanningSecs: scanningTime,
      scanningSelections: charCount,
      gazeSecs: gazeTime,
      speedup: Math.max(1, speedup)
    };

    // 1. Live translation if listener language is different from English
    let textToSpeak = phraseText;
    if (listenerLang !== 'en-IN') {
      textToSpeak = await translateText({ text: phraseText, targetLang: listenerLang });
      lastTranslation = {
        original: phraseText,
        translated: textToSpeak,
        lang: listenerLang
      };
    } else {
      lastTranslation = null;
    }

    // 2. Text-to-speech output (pausing speech recognition while speaking to prevent self-hearing)
    speakPhrase(textToSpeak, listenerLang, {
      onStart: () => listener.pauseForSpeech(),
      onEnd: () => listener.resumeAfterSpeech(500)
    });

    // 3. Contract event: aac:spoken dispatched on window for caregiver companion
    window.dispatchEvent(
      new CustomEvent('aac:spoken', {
        detail: {
          text: textToSpeak,
          lang: listenerLang,
          originalText: phraseText
        }
      })
    );

    // 4. Log interaction into patient memory
    logInteraction({
      heard: heardText,
      reply: phraseText,
      kind,
      category
    });

    history.push({ speaker: 'patient', text: phraseText });

    if (mode !== 'chat') {
      mode = 'chat';
      chatMounted = false;
      render();
    } else {
      updateChatBoardInPlace();
    }
  }

  function handleHomeAction(item) {
    // Dispatch smart home request
    dispatchHomeRequest(item.kind, item.label);
    handleSelectPhrase(item.text, 'request', 'home');
  }

  function triggerEmergency() {
    isEmergency = true;
    startEmergencyAlarm();

    // Contract event: aac:emergency dispatched on window
    window.dispatchEvent(new CustomEvent('aac:emergency'));

    logInteraction({
      heard: heardText,
      reply: 'EMERGENCY ALARM ACTIVATED',
      kind: 'emergency',
      category: 'emergency'
    });

    render();
  }

  function dismissEmergency() {
    isEmergency = false;
    stopEmergencyAlarm();
    render();
  }

  function togglePatientLanguage() {
    patientLang = patientLang === 'en-IN' ? 'hi-IN' : 'en-IN';
    listener.setLanguage(patientLang);
    roleReplies = getOfflineRoleReplies(heardText || '', patientLang);
    updateChatBoardInPlace();
  }

  function toggleListenerLanguage() {
    const idx = LISTENER_LANGUAGES.findIndex((l) => l.code === listenerLang);
    const nextIdx = (idx + 1) % LISTENER_LANGUAGES.length;
    listenerLang = LISTENER_LANGUAGES[nextIdx].code;
    render();
  }

  async function openSummaryView() {
    mode = 'summary';
    isLoadingSummary = true;
    summaryReport = '';
    render();

    try {
      summaryReport = await generateDailySummary({
        dailyLog: getDailyLog(),
        memory
      });
    } catch (err) {
      summaryReport = 'Unable to generate summary at this time.';
    } finally {
      isLoadingSummary = false;
      render();
    }
  }

  function fetchTypePredictions(buffer) {
    if (typePredictionTimer) clearTimeout(typePredictionTimer);
    typePredictionTimer = setTimeout(async () => {
      const trimmed = (buffer || '').trim();
      if (!trimmed) {
        typePredictions = ['I need', 'Thank you', 'Please help', 'Water', 'Yes', 'No'];
        render();
        return;
      }
      const words = trimmed.split(/\s+/);
      const lastWord = words[words.length - 1] || '';
      try {
        const preds = await predictWordCompletions(lastWord, trimmed);
        if (Array.isArray(preds) && preds.length > 0) {
          typePredictions = preds.slice(0, 5);
          render();
        }
      } catch (e) {
        // ignore
      }
    }, 200);
  }

  // Unified action handler with click double-fire prevention
  function handleAction(target) {
    const action = target.dataset.action;
    const value = target.dataset.value;

    if (action === 'emergency') {
      triggerEmergency();
    } else if (action === 'dismiss-emergency') {
      dismissEmergency();
    } else if (action === 'fatigue-rest') {
      fatigueAlert = null;
      handleSelectPhrase("I am feeling tired. I'd like to rest my eyes.", 'fatigue', 'health');
    } else if (action === 'core-yes') {
      handleSelectPhrase(patientLang.startsWith('hi') ? 'हाँ' : 'Yes', 'affirmation', 'core');
    } else if (action === 'core-no') {
      handleSelectPhrase(patientLang.startsWith('hi') ? 'नहीं' : 'No', 'refusal', 'core');
    } else if (action === 'core-wait') {
      handleSelectPhrase(patientLang.startsWith('hi') ? 'कृपया प्रतीक्षा करें' : 'Please wait a moment', 'wait', 'core');
    } else if (action === 'core-repeat') {
      if (lastSpokenText) {
        handleSelectPhrase(lastSpokenText, 'repeat', 'core');
      }
    } else if (action === 'history-repeat') {
      if (value) {
        handleSelectPhrase(value, 'history', 'core');
      }
    } else if (action === 'pinned-phrase') {
      if (value) {
        handleSelectPhrase(value, 'pinned', 'core');
      }
    } else if (action === 'toggle-pin') {
      const role = target.dataset.role;
      const text = target.dataset.text || roleReplies[role]?.text;
      const tag = target.dataset.tag || roleReplies[role]?.tag || 'Pinned';
      pinnedReplies = togglePinnedReply(role, text, tag);
      updateChatBoardInPlace();
    } else if (action === 'reply') {
      handleSelectPhrase(value || target.querySelector('.conv-tile-text')?.textContent || target.textContent);
    } else if (action === 'nav-topics') {
      mode = 'topics';
      chatMounted = false;
      render();
    } else if (action === 'topic-select') {
      activeTopic = TOPICS.find((t) => t.id === value) || null;
      mode = 'topic_items';
      render();
    } else if (action === 'topic-item-select') {
      const item = JSON.parse(value || '{}');
      if (item.kind) {
        handleHomeAction(item);
      } else {
        handleSelectPhrase(item.text, 'topic', activeTopic?.id || 'general');
      }
    } else if (action === 'nav-categories') {
      mode = 'categories';
      chatMounted = false;
      render();
    } else if (action === 'nav-type' || action === 'nav-spell') {
      mode = 'type';
      chatMounted = false;
      fetchTypePredictions(typeBuffer);
      render();
    } else if (action === 'type-key') {
      typeBuffer += value;
      fetchTypePredictions(typeBuffer);
      render();
    } else if (action === 'type-space') {
      typeBuffer += ' ';
      fetchTypePredictions(typeBuffer);
      render();
    } else if (action === 'type-backspace') {
      typeBuffer = typeBuffer.slice(0, -1);
      fetchTypePredictions(typeBuffer);
      render();
    } else if (action === 'type-clear') {
      typeBuffer = '';
      typePredictions = ['I need', 'Thank you', 'Please help', 'Water', 'Yes', 'No'];
      render();
    } else if (action === 'type-prediction') {
      const words = typeBuffer.trimEnd().split(' ');
      if (words.length > 0 && words[words.length - 1].length > 0 && !typeBuffer.endsWith(' ')) {
        words[words.length - 1] = value;
        typeBuffer = words.join(' ') + ' ';
      } else {
        typeBuffer = (typeBuffer ? typeBuffer.trimEnd() + ' ' : '') + value + ' ';
      }
      fetchTypePredictions(typeBuffer);
      render();
    } else if (action === 'type-speak') {
      if (typeBuffer.trim()) {
        const text = typeBuffer.trim();
        typeBuffer = '';
        typePredictions = ['I need', 'Thank you', 'Please help', 'Water', 'Yes', 'No'];
        handleSelectPhrase(text, 'type', 'keyboard');
      }
    } else if (action === 'type-whatsapp') {
      const text = typeBuffer.trim() || 'Hello, I am sending this message via Gaze Voice.';
      window.open(getWhatsAppShareUrl(text), '_blank');
    } else if (action === 'audio-stop') {
      window.speechSynthesis.cancel();
      listener.stop();
      isAudioStopped = true;
      render();
    } else if (action === 'audio-listen') {
      isAudioStopped = false;
      listener.start();
      render();
    } else if (action === 'nav-back') {
      if (mode === 'category_items') {
        mode = 'categories';
      } else if (mode === 'topic_items') {
        mode = 'topics';
      } else {
        mode = 'chat';
        chatMounted = false;
      }
      render();
    } else if (action === 'category-select') {
      activeCategory = CATEGORIES.find((c) => c.id === value) || null;
      mode = 'category_items';
      render();
    } else if (action === 'spell-group') {
      spellEngine.selectGroup(value);
      render();
    } else if (action === 'spell-letter') {
      spellEngine.addLetter(value);
    } else if (action === 'spell-prediction') {
      spellEngine.selectPrediction(value);
    } else if (action === 'spell-space') {
      spellEngine.addSpace();
    } else if (action === 'spell-backspace') {
      spellEngine.backspace();
    } else if (action === 'spell-clear') {
      spellEngine.clear();
    } else if (action === 'spell-speak') {
      if (spellEngine.buffer.trim()) {
        handleSelectPhrase(spellEngine.buffer.trim(), 'spell', 'keyboard');
        spellEngine.clear();
        mode = 'chat';
        chatMounted = false;
        render();
      }
    } else if (action === 'spell-whatsapp') {
      const text = spellEngine.buffer.trim() || 'Hello, this is Aarav Sharma sending a message via Gaze Voice.';
      window.open(getWhatsAppShareUrl(text), '_blank');
    } else if (action === 'toggle-lang') {
      togglePatientLanguage();
    } else if (action === 'toggle-listener-lang') {
      toggleListenerLanguage();
    } else if (action === 'toggle-mic') {
      listener.toggle();
      isAudioStopped = !listener.isListening;
      render();
    } else if (action === 'toggle-demo') {
      isJudgeMode = !isJudgeMode;
      render();
    } else if (action === 'toggle-contrast') {
      isHighContrast = !isHighContrast;
      render();
    } else if (action === 'toggle-size') {
      isLargeText = !isLargeText;
      render();
    } else if (action === 'toggle-input') {
      showManualInput = !showManualInput;
      render();
    } else if (action === 'open-profile') {
      mode = 'profile';
      chatMounted = false;
      render();
    } else if (action === 'close-profile') {
      mode = 'chat';
      chatMounted = false;
      render();
    } else if (action === 'open-summary') {
      openSummaryView();
    } else if (action === 'close-summary') {
      mode = 'chat';
      chatMounted = false;
      render();
    }
  }

  // Double-fire prevention: gaze-select sets timestamp and suppresses click on same target within 500ms
  function onGazeSelect(e) {
    const pinBtn = e.target.closest('.conv-pin-btn');
    if (pinBtn) {
      handleAction(pinBtn);
      return;
    }
    const target = e.target.closest('[data-gaze-target]');
    if (!target) return;
    lastGazeSelectTime = performance.now();
    lastGazeTarget = target;
    handleAction(target);
  }

  function onClick(e) {
    const pinBtn = e.target.closest('.conv-pin-btn');
    if (pinBtn) {
      e.stopPropagation();
      handleAction(pinBtn);
      return;
    }
    const target = e.target.closest('[data-gaze-target]');
    if (!target) return;
    const now = performance.now();
    if (target === lastGazeTarget && (now - lastGazeSelectTime) < 500) {
      return; // Ignore duplicate click event
    }
    handleAction(target);
  }

  app.addEventListener('gaze-select', onGazeSelect);
  app.addEventListener('click', onClick);

  // In-place stable board updater: mutates DOM nodes without recreation, preserving Team A dwell tracking
  function updateChatBoardInPlace() {
    if (mode !== 'chat' || isEmergency) {
      render();
      return;
    }

    const board = app.querySelector('.conv-board');
    if (!board) {
      render();
      return;
    }

    const isHi = patientLang.startsWith('hi');

    // 1. Update heard text in top bar
    const heardEl = app.querySelector('.conv-heard-text');
    if (heardEl) {
      const displayTxt = heardText || (isListening ? 'Listening for speech...' : 'Microphone paused');
      if (heardEl.textContent.trim() !== displayTxt) {
        heardEl.textContent = displayTxt;
      }
    }

    const micDot = app.querySelector('.conv-mic-dot');
    if (micDot) {
      micDot.classList.toggle('active', isListening);
    }

    const loadingPill = app.querySelector('.conv-loading-pill');
    if (loadingPill) {
      loadingPill.style.display = isLoadingReplies ? 'inline-block' : 'none';
    }

    // 2. Update Core Zone Repeat Tile
    const repeatTile = app.querySelector('#tile-repeat');
    if (repeatTile) {
      repeatTile.dataset.value = lastSpokenText || '';
      const textSpan = repeatTile.querySelector('.conv-tile-text');
      if (textSpan) {
        const repeatLabel = isHi ? '🔁 दोहराएं' : '🔁 Repeat';
        textSpan.textContent = lastSpokenText ? `${repeatLabel}: "${lastSpokenText}"` : repeatLabel;
      }
    }

    // 3. Update History Strip
    const h1Tile = app.querySelector('#tile-hist-0');
    const h2Tile = app.querySelector('#tile-hist-1');
    const h3Tile = app.querySelector('#tile-hist-2');
    const hist = [h1Tile, h2Tile, h3Tile];
    for (let i = 0; i < 3; i++) {
      const el = hist[i];
      if (el) {
        const phrase = spokenHistory[i] || '';
        el.dataset.value = phrase;
        el.style.opacity = phrase ? '1' : '0.4';
        const txt = el.querySelector('.conv-tile-text');
        if (txt) {
          txt.textContent = phrase ? `🕒 "${phrase}"` : `🕒 (Empty)`;
        }
      }
    }

    // 4. Update Pinned phrase in aux row
    const pinnedTile = app.querySelector('#tile-pinned');
    if (pinnedTile) {
      const pinnedKeys = Object.keys(pinnedReplies);
      const firstPinned = pinnedKeys.length > 0 ? pinnedReplies[pinnedKeys[0]] : null;
      if (firstPinned) {
        pinnedTile.dataset.value = firstPinned.text;
        pinnedTile.style.opacity = '1';
        const txt = pinnedTile.querySelector('.conv-tile-text');
        if (txt) txt.textContent = `📌 "${firstPinned.text}"`;
      } else {
        pinnedTile.dataset.value = '';
        pinnedTile.style.opacity = '0.5';
        const txt = pinnedTile.querySelector('.conv-tile-text');
        if (txt) txt.textContent = `📌 (Pin phrases)`;
      }
    }

    // 5. Update Fixed Role Slots in place
    const roles = ['agree', 'decline', 'need', 'feeling', 'ask_back'];
    for (const role of roles) {
      const slotEl = app.querySelector(`#slot-${role}`);
      if (!slotEl) continue;

      const isPinned = !!pinnedReplies[role];
      const data = isPinned ? pinnedReplies[role] : roleReplies[role];
      if (!data) continue;

      const text = data.text;
      const tag = isPinned ? '📌 PINNED' : data.tag;

      slotEl.classList.toggle('is-pinned', isPinned);
      slotEl.dataset.value = text;
      slotEl.dataset.role = role;
      slotEl.dataset.text = text;
      slotEl.dataset.tag = tag;

      const textEl = slotEl.querySelector('.conv-tile-text');
      if (textEl && textEl.textContent !== text) {
        textEl.textContent = text;
      }
      const tagEl = slotEl.querySelector('.conv-tile-tag');
      if (tagEl && tagEl.textContent !== tag) {
        tagEl.textContent = tag;
      }

      const pinBtn = slotEl.querySelector('.conv-pin-btn');
      if (pinBtn) {
        pinBtn.dataset.role = role;
        pinBtn.dataset.text = text;
        pinBtn.dataset.tag = data.tag || 'Pinned';
        pinBtn.textContent = isPinned ? '📌' : '📍';
        pinBtn.title = isPinned ? 'Click to unpin' : 'Click to pin permanently';
      }
    }

    // Slot 6: Something Else
    const slotOther = app.querySelector('#slot-other');
    if (slotOther) {
      const otherTxt = slotOther.querySelector('.conv-tile-text');
      if (otherTxt) {
        otherTxt.textContent = isHi ? '⌨️ कुछ और लिखें' : '⌨️ Something else';
      }
    }

    // Update audio button in sidebar
    const audioBtn = app.querySelector('.conv-tile-audio');
    if (audioBtn) {
      if (isAudioStopped) {
        audioBtn.dataset.action = 'audio-listen';
        audioBtn.style.borderColor = '#00e676';
        audioBtn.style.background = 'rgba(0,230,118,0.12)';
        const tag = audioBtn.querySelector('.conv-tile-tag');
        if (tag) tag.textContent = 'Audio';
        const txt = audioBtn.querySelector('.conv-tile-text');
        if (txt) txt.textContent = '▶️ Listen';
      } else {
        audioBtn.dataset.action = 'audio-stop';
        audioBtn.style.borderColor = '#ff9800';
        audioBtn.style.background = 'rgba(255,152,0,0.12)';
        const tag = audioBtn.querySelector('.conv-tile-tag');
        if (tag) tag.textContent = 'Audio';
        const txt = audioBtn.querySelector('.conv-tile-text');
        if (txt) txt.textContent = '⏹️ Stop';
      }
    }
  }

  function render() {
    // Accessibility modifier classes
    app.classList.toggle('contrast-high', isHighContrast);
    app.classList.toggle('text-large', isLargeText);

    // If already mounted in chat mode, mutate DOM in-place without replacing elements
    if (mode === 'chat' && chatMounted && app.querySelector('.conv-board')) {
      updateChatBoardInPlace();
      return;
    }

    const isHi = patientLang.startsWith('hi');
    const listenerObj = LISTENER_LANGUAGES.find((l) => l.code === listenerLang) || LISTENER_LANGUAGES[0];

    // 1. Emergency Fullscreen Modal
    if (isEmergency) {
      app.innerHTML = `
        <div class="conv-emergency-modal">
          <div class="conv-emergency-banner">
            <span>🚨</span> PATIENT NEEDS HELP <span>🚨</span>
          </div>
          <div class="conv-emergency-sub">
            <strong>${memory.name}</strong> • ${memory.condition}<br/>
            Usual needs: ${memory.usualNeeds}<br/>
            Daily Meds: ${memory.meds}<br/>
            Emergency contacts: ${memory.familyNames}
          </div>
          <button class="conv-tile conv-emergency-dismiss" data-gaze-target data-gaze-dwell="1200" data-action="dismiss-emergency">
            <span class="conv-tile-text">DISMISS ALARM</span>
            <div class="conv-tile-dwell-ring"></div>
          </button>
        </div>
      `;
      return;
    }

    // 2. First-Run Patient Onboarding Modal
    if (mode === 'onboarding') {
      app.innerHTML = `
        <div class="conv-modal-overlay">
          <div class="conv-modal-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <h2 style="margin:0; color:var(--conv-accent);">👋 Welcome to Gaze Voice</h2>
              <span class="conv-caregiver-badge">Caregiver Setup (Keyboard & Mouse)</span>
            </div>
            <p style="color:var(--conv-text-muted); font-size:0.95rem; margin-top:0;">
              Caregiver: Please customize the patient profile below to enable personalized AI predictions and medication reminders.
            </p>
            <div class="conv-form-group">
              <label>Patient Name</label>
              <input type="text" id="onboard-name" value="${escapeHtml(memory.name)}" />
            </div>
            <div class="conv-form-group">
              <label>Condition & Needs</label>
              <input type="text" id="onboard-condition" value="${escapeHtml(memory.condition)}" />
            </div>
            <div class="conv-form-group">
              <label>Family & Caregivers</label>
              <input type="text" id="onboard-family" value="${escapeHtml(memory.familyNames)}" />
            </div>
            <div class="conv-form-group">
              <label>Scheduled Meds & Times</label>
              <input type="text" id="onboard-meds" value="${escapeHtml(memory.meds)}" />
            </div>
            <div class="conv-form-group">
              <label>Likes & Interests</label>
              <input type="text" id="onboard-likes" value="${escapeHtml(memory.likes)}" />
            </div>
            <div class="conv-modal-actions">
              <button class="conv-btn-pill active" id="btn-save-onboarding" style="padding:10px 24px; font-size:1.05rem;">
                🚀 Start Communication
              </button>
            </div>
          </div>
        </div>
      `;
      const btnOnboard = app.querySelector('#btn-save-onboarding');
      if (btnOnboard) {
        btnOnboard.onclick = () => {
          memory = {
            ...memory,
            name: app.querySelector('#onboard-name').value.trim() || memory.name,
            condition: app.querySelector('#onboard-condition').value.trim() || memory.condition,
            familyNames: app.querySelector('#onboard-family').value.trim() || memory.familyNames,
            meds: app.querySelector('#onboard-meds').value.trim() || memory.meds,
            likes: app.querySelector('#onboard-likes').value.trim() || memory.likes
          };
          saveMemory(memory);
          localStorage.setItem('gaze_voice_onboarded', 'true');
          mode = 'chat';
          render();
        };
      }
      return;
    }

    // 3. Doctor/Family Daily Summary Modal (Caregiver-Only)
    if (mode === 'summary') {
      app.innerHTML = `
        <div class="conv-modal-overlay">
          <div class="conv-modal-card conv-summary-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <h2 style="margin:0; color:var(--conv-accent);">📊 Daily Medical & Care Summary</h2>
              <span class="conv-caregiver-badge">Clinician View (Keyboard & Mouse)</span>
            </div>
            ${
              isLoadingSummary
                ? '<div style="padding:40px; text-align:center; font-size:1.3rem; color:var(--conv-accent);">Generating clinical report with AI...</div>'
                : `<div class="conv-summary-text" id="summary-content">${escapeHtml(summaryReport)}</div>`
            }
            <div class="conv-modal-actions">
              <button class="conv-btn-pill" id="btn-copy-summary">📋 Copy Report</button>
              <button class="conv-btn-pill" id="btn-print-summary">🖨️ Print / Save PDF</button>
              <button class="conv-btn-pill active" data-action="close-summary">✕ Close</button>
            </div>
          </div>
        </div>
      `;
      const btnCopy = app.querySelector('#btn-copy-summary');
      if (btnCopy) {
        btnCopy.onclick = () => {
          navigator.clipboard.writeText(summaryReport);
          btnCopy.textContent = '✅ Copied!';
          setTimeout(() => { btnCopy.textContent = '📋 Copy Report'; }, 2000);
        };
      }
      const btnPrint = app.querySelector('#btn-print-summary');
      if (btnPrint) {
        btnPrint.onclick = () => window.print();
      }
      return;
    }

    // 4. Caregiver Memory & Profile Settings Modal (Caregiver-Only)
    if (mode === 'profile') {
      app.innerHTML = `
        <div class="conv-modal-overlay">
          <div class="conv-modal-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <h2 style="margin:0; color:var(--conv-accent);">Caregiver: Patient Profile & Memory</h2>
              <span class="conv-caregiver-badge">Caregiver Editor (Keyboard & Mouse)</span>
            </div>
            <div class="conv-form-group">
              <label>Patient Name</label>
              <input type="text" id="prof-name" value="${escapeHtml(memory.name)}" />
            </div>
            <div class="conv-form-group">
              <label>Condition & Communication</label>
              <input type="text" id="prof-condition" value="${escapeHtml(memory.condition)}" />
            </div>
            <div class="conv-form-group">
              <label>Family, Carers & Doctors</label>
              <input type="text" id="prof-family" value="${escapeHtml(memory.familyNames)}" />
            </div>
            <div class="conv-form-group">
              <label>Daily Meds & Schedule</label>
              <input type="text" id="prof-meds" value="${escapeHtml(memory.meds)}" />
            </div>
            <div class="conv-form-group">
              <label>Personal Likes & Interests</label>
              <input type="text" id="prof-likes" value="${escapeHtml(memory.likes)}" />
            </div>
            <div class="conv-form-group">
              <label>Usual Physical Needs</label>
              <input type="text" id="prof-needs" value="${escapeHtml(memory.usualNeeds)}" />
            </div>
            <div class="conv-form-group">
              <label>Clinical & Language Notes</label>
              <textarea id="prof-notes" rows="2">${escapeHtml(memory.notes || '')}</textarea>
            </div>
            <div class="conv-modal-actions">
              <button class="conv-btn-pill active" id="btn-save-profile">Save Changes</button>
              <button class="conv-btn-pill" data-action="close-profile">Close</button>
            </div>
          </div>
        </div>
      `;
      const btnSave = app.querySelector('#btn-save-profile');
      if (btnSave) {
        btnSave.onclick = () => {
          memory = {
            name: app.querySelector('#prof-name').value,
            condition: app.querySelector('#prof-condition').value,
            familyNames: app.querySelector('#prof-family').value,
            meds: app.querySelector('#prof-meds').value,
            likes: app.querySelector('#prof-likes').value,
            usualNeeds: app.querySelector('#prof-needs').value,
            notes: app.querySelector('#prof-notes').value
          };
          saveMemory(memory);
          mode = 'chat';
          render();
        };
      }
      return;
    }

    // 5. Top Bar (Heard Strip, Translation Subtitle, Caregiver Toolbar)
    const topBarHtml = `
      <header class="conv-topbar">
        <div class="conv-heard-container">
          <div class="conv-heard-label">
            <span class="conv-mic-dot ${isListening ? 'active' : ''}"></span>
            Heard:
          </div>
          <div class="conv-heard-text ${heardText ? '' : 'placeholder'}">
            ${escapeHtml(heardText || (isListening ? 'Listening for speech...' : 'Microphone paused'))}
          </div>
          ${isLoadingReplies ? '<div class="conv-loading-pill">Thinking...</div>' : ''}
        </div>

        <div class="conv-caregiver-controls" title="Caregiver & Judge Controls (Mouse / Touch Only)">
          <span class="conv-caregiver-label">Caregiver:</span>
          <button class="conv-btn-pill ${isListening ? 'active' : ''}" data-action="toggle-mic">
            🎤 ${isListening ? 'Mic On' : 'Mic Off'}
          </button>
          <button class="conv-btn-pill ${isJudgeMode ? 'active' : ''}" data-action="toggle-demo" title="Toggle Judge Demo Mode">
            🎯 Demo
          </button>
          <button class="conv-btn-pill ${isHighContrast ? 'active' : ''}" data-action="toggle-contrast" title="High Contrast Mode">
            🌓 Contrast
          </button>
          <button class="conv-btn-pill ${isLargeText ? 'active' : ''}" data-action="toggle-size" title="Bigger Text Toggle">
            Aa Size
          </button>
          <button class="conv-btn-pill" data-action="toggle-listener-lang" title="Toggle Listener Voice Language">
            🌐 ${escapeHtml(listenerObj.name)}
          </button>
          <button class="conv-btn-pill" data-action="toggle-input" title="Manual Text Box Fallback">
            ⌨️ Text
          </button>
          <button class="conv-btn-pill" data-action="open-summary" title="Daily Medical Summary">
            📊 Summary
          </button>
          <button class="conv-btn-pill" data-action="open-profile" title="Patient Profile & Meds">
            ⚙️ ${escapeHtml(memory.name.split(' ')[0])}
          </button>
        </div>
      </header>

      ${
        isJudgeMode
          ? `
        <div class="conv-judge-guide">
          <div>
            🎯 <strong>Judge Prompt:</strong> Ask <em>"Did you sleep well?"</em> (or type below) &rarr; hover a reply tile for 1.2s to speak!
          </div>
          <div style="font-size:0.9rem; opacity:0.85;">
            Follow-up: <em>"Are you thirsty?"</em> &bull; Try <strong>🔤 Spell</strong> &bull; Hold <strong>🚨 EMERGENCY</strong>
          </div>
        </div>
      `
          : ''
      }

      ${
        liveProof
          ? `
        <div class="conv-proof-banner">
          <div>
            ⚡ <strong>Live Proof:</strong> Letter-by-letter scanning would take <strong>${liveProof.scanningSelections} selections</strong> (~${liveProof.scanningSecs}s). Gaze Voice: <strong>1 glance in ${liveProof.gazeSecs}s</strong>!
          </div>
          <div class="conv-proof-badge">
            ${liveProof.speedup}x FASTER
          </div>
        </div>
      `
          : ''
      }

      ${
        lastTranslation
          ? `
        <div class="conv-translation-box">
          <span class="conv-trans-label">Spoken in ${escapeHtml(listenerObj.name)}:</span>
          <span class="conv-trans-text">"${escapeHtml(lastTranslation.translated)}"</span>
          <span style="opacity:0.6; font-size:0.9rem;">(Original: "${escapeHtml(lastTranslation.original)}")</span>
        </div>
      `
          : ''
      }

      ${
        showManualInput
          ? `
        <div style="background:#131824; padding:8px 20px; display:flex; gap:10px; border-bottom:1px solid #263347;">
          <input type="text" id="manual-utterance" placeholder="Type question for patient (fallback for noisy room)..." style="flex:1; background:#0b0e14; border:1px solid #263347; color:#fff; padding:8px 12px; border-radius:8px;" />
          <button class="conv-btn-pill active" id="btn-submit-manual">Ask</button>
        </div>
      `
          : ''
      }
    `;

    // 6. Side Navigation Rail (All large gaze targets with fixed Emergency)
    let navTilesHtml = '';

    if (mode === 'chat') {
      navTilesHtml = `
        ${
          fatigueAlert
            ? `
          <button class="conv-tile conv-tile-nav conv-tile-fatigue" data-gaze-target data-action="fatigue-rest">
            <span class="conv-tile-tag">Tired?</span>
            <span class="conv-tile-text">😴 Take a break</span>
            <div class="conv-tile-dwell-ring"></div>
          </button>
        `
            : ''
        }
        <button class="conv-tile conv-tile-nav" data-gaze-target data-action="nav-topics" style="border-color:#ab47bc; background:rgba(171,71,188,0.12);">
          <span class="conv-tile-tag">Initiate</span>
          <span class="conv-tile-text">💬 I want to say</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>

        <button class="conv-tile conv-tile-nav" data-gaze-target data-action="nav-type">
          <span class="conv-tile-tag">Keyboard</span>
          <span class="conv-tile-text">⌨️ ${isHi ? 'लिखें' : 'Type'}</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>

        <button class="conv-tile conv-tile-nav" data-gaze-target data-action="nav-categories">
          <span class="conv-tile-tag">AAC Library</span>
          <span class="conv-tile-text">📂 ${isHi ? 'श्रेणियाँ' : 'Categories'}</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>

        ${
          isAudioStopped
            ? `
          <button class="conv-tile conv-tile-nav" data-gaze-target data-action="audio-listen" style="border-color:#00e676; background:rgba(0,230,118,0.12);">
            <span class="conv-tile-tag">Audio</span>
            <span class="conv-tile-text">▶️ Listen</span>
            <div class="conv-tile-dwell-ring"></div>
          </button>
        `
            : `
          <button class="conv-tile conv-tile-nav" data-gaze-target data-action="audio-stop" style="border-color:#ff9800; background:rgba(255,152,0,0.12);">
            <span class="conv-tile-tag">Audio</span>
            <span class="conv-tile-text">⏹️ Stop</span>
            <div class="conv-tile-dwell-ring"></div>
          </button>
        `
        }
      `;
    } else if (mode === 'type' || mode === 'spell') {
      navTilesHtml = `
        <button class="conv-tile conv-tile-nav conv-tile-back" data-gaze-target data-action="nav-back">
          <span class="conv-tile-tag">Return</span>
          <span class="conv-tile-text">💬 Back to Chat</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>

        ${
          isAudioStopped
            ? `
          <button class="conv-tile conv-tile-nav" data-gaze-target data-action="audio-listen" style="border-color:#00e676; background:rgba(0,230,118,0.12);">
            <span class="conv-tile-tag">Audio</span>
            <span class="conv-tile-text">▶️ Listen</span>
            <div class="conv-tile-dwell-ring"></div>
          </button>
        `
            : `
          <button class="conv-tile conv-tile-nav" data-gaze-target data-action="audio-stop" style="border-color:#ff9800; background:rgba(255,152,0,0.12);">
            <span class="conv-tile-tag">Audio</span>
            <span class="conv-tile-text">⏹️ Stop</span>
            <div class="conv-tile-dwell-ring"></div>
          </button>
        `
        }
      `;
    } else {
      // Topics, Categories, and sub-menus
      navTilesHtml = `
        <button class="conv-tile conv-tile-nav conv-tile-back" data-gaze-target data-action="nav-back">
          <span class="conv-tile-tag">Navigation</span>
          <span class="conv-tile-text">⬅️ Back to Chat</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>
      `;
    }

    const sidebarHtml = `
      <aside class="conv-sidebar">
        <nav class="conv-nav-rail">
          ${navTilesHtml}
        </nav>
        <div class="conv-emergency-container">
          <button class="conv-tile conv-tile-emergency" data-gaze-target data-gaze-always="1" data-gaze-dwell="2000" data-action="emergency">
            <span class="conv-tile-tag">Hold 2s</span>
            <span class="conv-tile-text">🚨 EMERGENCY</span>
            <div class="conv-tile-dwell-ring"></div>
          </button>
        </div>
      </aside>
    `;

    // 7. Main Interactive Grid depending on Mode
    let mainContentHtml = '';

    if (mode === 'chat') {
      const firstPinnedKey = Object.keys(pinnedReplies)[0];
      const firstPinnedText = firstPinnedKey ? pinnedReplies[firstPinnedKey].text : '';

      mainContentHtml = `
        <div class="conv-board">
          <!-- 1. Fixed Core Zone (Yes, No, Wait/Stop, Repeat Last) -->
          <div class="conv-core-zone">
            <button class="conv-tile conv-tile-core core-yes" data-gaze-target data-action="core-yes">
              <span class="conv-tile-tag">Affirm</span>
              <span class="conv-tile-text">${isHi ? '✅ हाँ' : '✅ Yes'}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
            <button class="conv-tile conv-tile-core core-no" data-gaze-target data-action="core-no">
              <span class="conv-tile-tag">Refuse</span>
              <span class="conv-tile-text">${isHi ? '❌ नहीं' : '❌ No'}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
            <button class="conv-tile conv-tile-core core-wait" data-gaze-target data-action="core-wait">
              <span class="conv-tile-tag">Hold On</span>
              <span class="conv-tile-text">${isHi ? '⏳ रुकिए' : '⏳ Please wait'}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
            <button class="conv-tile conv-tile-core core-repeat" id="tile-repeat" data-gaze-target data-action="core-repeat" data-value="${escapeHtml(lastSpokenText)}">
              <span class="conv-tile-tag">Repeat</span>
              <span class="conv-tile-text">${escapeHtml(isHi ? '🔁 दोहराएं: ' + (lastSpokenText || '') : '🔁 Repeat: ' + (lastSpokenText || 'Nothing yet'))}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
          </div>

          <!-- 2. Pinned Phrase & History Strip (Last 3 Spoken) -->
          <div class="conv-aux-row">
            <button class="conv-tile conv-tile-pinned" id="tile-pinned" data-gaze-target data-action="pinned-phrase" data-value="${escapeHtml(firstPinnedText)}" title="Pinned Phrase">
              <span class="conv-tile-text">${firstPinnedText ? '📌 ' + escapeHtml(firstPinnedText) : '📌 (Pin phrases)'}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
            <button class="conv-tile conv-tile-history" id="tile-hist-0" data-gaze-target data-action="history-repeat" data-value="${escapeHtml(spokenHistory[0] || '')}">
              <span class="conv-tile-text">🕒 ${escapeHtml(spokenHistory[0] || '(Empty)')}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
            <button class="conv-tile conv-tile-history" id="tile-hist-1" data-gaze-target data-action="history-repeat" data-value="${escapeHtml(spokenHistory[1] || '')}">
              <span class="conv-tile-text">🕒 ${escapeHtml(spokenHistory[1] || '(Empty)')}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
            <button class="conv-tile conv-tile-history" id="tile-hist-2" data-gaze-target data-action="history-repeat" data-value="${escapeHtml(spokenHistory[2] || '')}">
              <span class="conv-tile-text">🕒 ${escapeHtml(spokenHistory[2] || '(Empty)')}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
          </div>

          <!-- 3. Fixed Role Slots (Agree, Decline, Need, Feeling, Ask Back, Something Else) -->
          <div class="conv-role-grid">
            <!-- Slot 1: Agree -->
            <div class="conv-tile conv-tile-role ${pinnedReplies.agree ? 'is-pinned' : ''}" id="slot-agree" data-gaze-target data-action="reply" data-role="agree" data-value="${escapeHtml((pinnedReplies.agree || roleReplies.agree).text)}">
              <span class="conv-tile-tag">${pinnedReplies.agree ? '📌 PINNED' : escapeHtml(roleReplies.agree.tag)}</span>
              <span class="conv-tile-text">${escapeHtml((pinnedReplies.agree || roleReplies.agree).text)}</span>
              <button class="conv-pin-btn" data-action="toggle-pin" data-role="agree" data-text="${escapeHtml((pinnedReplies.agree || roleReplies.agree).text)}" data-tag="${escapeHtml(roleReplies.agree.tag)}" title="${pinnedReplies.agree ? 'Unpin' : 'Pin'}">${pinnedReplies.agree ? '📌' : '📍'}</button>
              <div class="conv-tile-dwell-ring"></div>
            </div>

            <!-- Slot 2: Decline -->
            <div class="conv-tile conv-tile-role ${pinnedReplies.decline ? 'is-pinned' : ''}" id="slot-decline" data-gaze-target data-action="reply" data-role="decline" data-value="${escapeHtml((pinnedReplies.decline || roleReplies.decline).text)}">
              <span class="conv-tile-tag">${pinnedReplies.decline ? '📌 PINNED' : escapeHtml(roleReplies.decline.tag)}</span>
              <span class="conv-tile-text">${escapeHtml((pinnedReplies.decline || roleReplies.decline).text)}</span>
              <button class="conv-pin-btn" data-action="toggle-pin" data-role="decline" data-text="${escapeHtml((pinnedReplies.decline || roleReplies.decline).text)}" data-tag="${escapeHtml(roleReplies.decline.tag)}" title="${pinnedReplies.decline ? 'Unpin' : 'Pin'}">${pinnedReplies.decline ? '📌' : '📍'}</button>
              <div class="conv-tile-dwell-ring"></div>
            </div>

            <!-- Slot 3: Need -->
            <div class="conv-tile conv-tile-role ${pinnedReplies.need ? 'is-pinned' : ''}" id="slot-need" data-gaze-target data-action="reply" data-role="need" data-value="${escapeHtml((pinnedReplies.need || roleReplies.need).text)}">
              <span class="conv-tile-tag">${pinnedReplies.need ? '📌 PINNED' : escapeHtml(roleReplies.need.tag)}</span>
              <span class="conv-tile-text">${escapeHtml((pinnedReplies.need || roleReplies.need).text)}</span>
              <button class="conv-pin-btn" data-action="toggle-pin" data-role="need" data-text="${escapeHtml((pinnedReplies.need || roleReplies.need).text)}" data-tag="${escapeHtml(roleReplies.need.tag)}" title="${pinnedReplies.need ? 'Unpin' : 'Pin'}">${pinnedReplies.need ? '📌' : '📍'}</button>
              <div class="conv-tile-dwell-ring"></div>
            </div>

            <!-- Slot 4: Feeling -->
            <div class="conv-tile conv-tile-role ${pinnedReplies.feeling ? 'is-pinned' : ''}" id="slot-feeling" data-gaze-target data-action="reply" data-role="feeling" data-value="${escapeHtml((pinnedReplies.feeling || roleReplies.feeling).text)}">
              <span class="conv-tile-tag">${pinnedReplies.feeling ? '📌 PINNED' : escapeHtml(roleReplies.feeling.tag)}</span>
              <span class="conv-tile-text">${escapeHtml((pinnedReplies.feeling || roleReplies.feeling).text)}</span>
              <button class="conv-pin-btn" data-action="toggle-pin" data-role="feeling" data-text="${escapeHtml((pinnedReplies.feeling || roleReplies.feeling).text)}" data-tag="${escapeHtml(roleReplies.feeling.tag)}" title="${pinnedReplies.feeling ? 'Unpin' : 'Pin'}">${pinnedReplies.feeling ? '📌' : '📍'}</button>
              <div class="conv-tile-dwell-ring"></div>
            </div>

            <!-- Slot 5: Ask Back -->
            <div class="conv-tile conv-tile-role ${pinnedReplies.ask_back ? 'is-pinned' : ''}" id="slot-ask_back" data-gaze-target data-action="reply" data-role="ask_back" data-value="${escapeHtml((pinnedReplies.ask_back || roleReplies.ask_back).text)}">
              <span class="conv-tile-tag">${pinnedReplies.ask_back ? '📌 PINNED' : escapeHtml(roleReplies.ask_back.tag)}</span>
              <span class="conv-tile-text">${escapeHtml((pinnedReplies.ask_back || roleReplies.ask_back).text)}</span>
              <button class="conv-pin-btn" data-action="toggle-pin" data-role="ask_back" data-text="${escapeHtml((pinnedReplies.ask_back || roleReplies.ask_back).text)}" data-tag="${escapeHtml(roleReplies.ask_back.tag)}" title="${pinnedReplies.ask_back ? 'Unpin' : 'Pin'}">${pinnedReplies.ask_back ? '📌' : '📍'}</button>
              <div class="conv-tile-dwell-ring"></div>
            </div>

            <!-- Slot 6: Something Else (Opens Keyboard) -->
            <div class="conv-tile conv-tile-role" id="slot-other" data-gaze-target data-action="nav-type" style="border-color:var(--conv-accent); background:rgba(0,229,255,0.08);">
              <span class="conv-tile-tag">${isHi ? 'कीबोर्ड' : 'Keyboard'}</span>
              <span class="conv-tile-text">${isHi ? '⌨️ कुछ और लिखें' : '⌨️ Something else'}</span>
              <div class="conv-tile-dwell-ring"></div>
            </div>
          </div>
        </div>
      `;
    } else if (mode === 'topics') {
      // Patient Starts Conversations: Topic Tiles
      mainContentHtml = `
        <div class="conv-grid-container">
          ${TOPICS.map(
            (t) => `
            <button class="conv-tile" data-gaze-target data-action="topic-select" data-value="${t.id}">
              <span class="conv-tile-tag">${t.tag}</span>
              <span class="conv-tile-text">${t.icon} ${t.label}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
          `
          ).join('')}
          <button class="conv-tile" data-gaze-target data-action="nav-back">
            <span class="conv-tile-tag">Chat</span>
            <span class="conv-tile-text">💬 Back to Live Chat</span>
            <div class="conv-tile-dwell-ring"></div>
          </button>
        </div>
      `;
    } else if (mode === 'topic_items') {
      // Sub-items for selected topic
      const topic = activeTopic || TOPICS[0];
      mainContentHtml = `
        <div class="conv-grid-container">
          ${topic.tiles.map(
            (item) => `
            <button class="conv-tile" data-gaze-target data-action="topic-item-select" data-value='${escapeHtml(JSON.stringify(item))}'>
              <span class="conv-tile-tag">${item.tag}</span>
              <span class="conv-tile-text">${escapeHtml(item.text)}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
          `
          ).join('')}
        </div>
      `;
    } else if (mode === 'categories') {
      // Fixed Categories Tiles
      mainContentHtml = `
        <div class="conv-grid-container">
          ${CATEGORIES.map(
            (c) => `
            <button class="conv-tile" data-gaze-target data-action="category-select" data-value="${c.id}">
              <span class="conv-tile-tag">${c.tag}</span>
              <span class="conv-tile-text">${c.icon} ${isHi ? c.labelHi : c.label}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
          `
          ).join('')}
          <button class="conv-tile" data-gaze-target data-action="nav-back">
            <span class="conv-tile-tag">Chat</span>
            <span class="conv-tile-text">💬 Back to Live Chat</span>
            <div class="conv-tile-dwell-ring"></div>
          </button>
        </div>
      `;
    } else if (mode === 'category_items') {
      // Sub-tiles under selected category
      const currentCat = activeCategory || CATEGORIES[0];
      const phrases = (isHi ? currentCat.phrases['hi-IN'] : currentCat.phrases['en-IN']) || [];
      mainContentHtml = `
        <div class="conv-grid-container">
          ${phrases.slice(0, 6).map(
            (p) => `
            <button class="conv-tile" data-gaze-target data-action="reply" data-value="${escapeHtml(p)}">
              <span class="conv-tile-tag">${currentCat.tag}</span>
              <span class="conv-tile-text">${escapeHtml(p)}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
          `
          ).join('')}
        </div>
      `;
    } else if (mode === 'type' || mode === 'spell') {
      mainContentHtml = `
        <div class="conv-keyboard-container">
          <div class="conv-type-bar">
            <div class="conv-type-buffer">
              ${typeBuffer ? escapeHtml(typeBuffer) : '<span style="opacity:0.4; font-weight:500;">Type by glancing at letters...</span>'}<span class="conv-spell-cursor"></span>
            </div>
            <div style="font-size:0.9rem; color:var(--conv-text-muted); padding-left:12px;">
              ${typeBuffer.length} chars
            </div>
          </div>

          <div class="conv-type-predictions">
            ${typePredictions.slice(0, 5).map(
              (word) => `
              <button class="conv-tile conv-pred-tile" data-gaze-target data-action="type-prediction" data-value="${escapeHtml(word)}">
                <span class="conv-tile-text">✨ ${escapeHtml(word)}</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
            `
            ).join('')}
          </div>

          <div class="conv-qwerty-grid">
            <!-- Row 1: Q W E R T Y U I O P -->
            <div class="conv-qwerty-row">
              ${['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map(
                (k) => `
                <button class="conv-tile conv-key-tile" data-gaze-target data-action="type-key" data-value="${k}">
                  <span class="conv-tile-text">${k}</span>
                  <div class="conv-tile-dwell-ring"></div>
                </button>
              `
              ).join('')}
            </div>

            <!-- Row 2: A S D F G H J K L -->
            <div class="conv-qwerty-row">
              ${['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'].map(
                (k) => `
                <button class="conv-tile conv-key-tile" data-gaze-target data-action="type-key" data-value="${k}">
                  <span class="conv-tile-text">${k}</span>
                  <div class="conv-tile-dwell-ring"></div>
                </button>
              `
              ).join('')}
            </div>

            <!-- Row 3: Z X C V B N M + Backspace -->
            <div class="conv-qwerty-row">
              ${['Z', 'X', 'C', 'V', 'B', 'N', 'M'].map(
                (k) => `
                <button class="conv-tile conv-key-tile" data-gaze-target data-action="type-key" data-value="${k}">
                  <span class="conv-tile-text">${k}</span>
                  <div class="conv-tile-dwell-ring"></div>
                </button>
              `
              ).join('')}
              <button class="conv-tile conv-key-tile key-wide-2" data-gaze-target data-action="type-backspace">
                <span class="conv-tile-text">⌫ Back</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
            </div>

            <!-- Row 4: Clear, Space, Speak, WhatsApp -->
            <div class="conv-qwerty-row">
              <button class="conv-tile conv-key-tile key-wide-2 key-action-clear" data-gaze-target data-action="type-clear">
                <span class="conv-tile-text">✕ Clear</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
              <button class="conv-tile conv-key-tile key-wide-4" data-gaze-target data-action="type-space">
                <span class="conv-tile-text">␣ Space</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
              <button class="conv-tile conv-key-tile key-wide-3 key-action-speak" data-gaze-target data-action="type-speak">
                <span class="conv-tile-text">🔊 Speak</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
              <button class="conv-tile conv-key-tile key-wide-15" data-gaze-target data-action="type-whatsapp" style="border-color:#25d366; background:rgba(37,211,102,0.12);" title="Send via WhatsApp">
                <span class="conv-tile-text">💬 WA</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    app.innerHTML = `
      ${topBarHtml}
      <div class="conv-main-view">
        ${sidebarHtml}
        ${mainContentHtml}
      </div>
    `;

    if (mode === 'chat') {
      chatMounted = true;
    }

    // Hook manual text input if present
    const btnSubmit = app.querySelector('#btn-submit-manual');
    const inputManual = app.querySelector('#manual-utterance');
    if (btnSubmit && inputManual) {
      const submit = () => {
        const text = inputManual.value.trim();
        if (text) {
          heardText = text;
          history.push({ speaker: 'other', text });
          handleNewUtterance(text);
          showManualInput = false;
        }
      };
      btnSubmit.onclick = submit;
      inputManual.onkeydown = (e) => {
        if (e.key === 'Enter') submit();
      };
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Initial render
  render();
}
