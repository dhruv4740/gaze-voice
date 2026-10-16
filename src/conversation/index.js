// Team B (teammate) owns everything in src/conversation/.
// Implements the redesigned minimalist high-focus AAC interface:
// - Three bands: Slim topbar (heard question + quiet menu), Hero (3x2 grid of 6 reply tiles, 30px semibold text),
//   Bottom row (6 equal tiles: Yes, No, Wait, Keyboard, More, Emergency).
// - Single palette (#0f1115, #181b21, #2a2e36, teal accent, red emergency), zero emojis, no bloat.

import './conversation.css';
import {
  getMemory,
  saveMemory,
  logInteraction,
  getDailyLog,
  getPinnedReplies,
  togglePinnedReply,
  getSelectedTone,
  setSelectedTone,
  logPainRecord
} from './memory.js';
import { CATEGORIES, getOfflineRoleReplies } from './categories.js';
import { predictReplies, predictWordCompletions } from './groq.js';
import { SpeechListener, speakPhrase } from './speech.js';
import { startEmergencyAlarm, stopEmergencyAlarm } from './emergency.js';
import { TOPICS, dispatchHomeRequest, getWhatsAppShareUrl } from './home.js';
import { LISTENER_LANGUAGES, translateText } from './translation.js';
import { generateDailySummary } from './summary.js';

const ICONS = {
  keyboard: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"></path></svg>`,
  more: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle><circle cx="5" cy="12" r="1.5"></circle></svg>`,
  emergency: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  menu: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="17" x2="20" y2="17"></line></svg>`,
  pin: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z"></path></svg>`
};

const PAIN_ZONES = [
  { id: 'head', label: 'Head', labelHi: 'सिर', desc: 'Frontal / Temples' },
  { id: 'chest', label: 'Chest', labelHi: 'छाती', desc: 'Lungs / Sternum' },
  { id: 'stomach', label: 'Stomach', labelHi: 'पेट', desc: 'Abdomen / Digestion' },
  { id: 'back', label: 'Back', labelHi: 'पीठ', desc: 'Spine / Upper & Lower' },
  { id: 'left_arm', label: 'Left Arm', labelHi: 'बायाँ हाथ', desc: 'Shoulder / Arm' },
  { id: 'right_arm', label: 'Right Arm', labelHi: 'दायाँ हाथ', desc: 'Shoulder / Arm' },
  { id: 'left_leg', label: 'Left Leg', labelHi: 'बायाँ पैर', desc: 'Thigh / Knee / Foot' },
  { id: 'right_leg', label: 'Right Leg', labelHi: 'दायाँ पैर', desc: 'Thigh / Knee / Foot' }
];

export function startConversation(app) {
  let memory = getMemory();
  let patientLang = 'en-IN';
  let listenerLang = 'en-IN';
  let mode = 'chat'; // 'chat' | 'more' | 'pain' | 'pain_scale' | 'pain_exact' | 'type' | 'categories' | 'category_items' | 'topics' | 'topic_items' | 'home_requests' | 'pinned_list' | 'history_list' | 'tone_picker' | 'profile' | 'summary' | 'onboarding'
  let activeCategory = null;
  let activeTopic = null;
  let isEmergency = false;
  let isListening = false;
  let isLoadingReplies = false;
  let isLoadingSummary = false;
  let summaryReport = '';
  let heardText = 'Did you sleep well?';
  let heardFrom = 'mic'; // 'mic' | 'phone'
  let showCaregiverMenu = false;
  let fatigueAlert = null;
  let lastTranslation = null;

  let isResting = false;
  let isAudioStopped = false;
  let lastUtteranceNormalized = '';

  let currentTone = getSelectedTone() || 'gentle';
  let selectedPainZone = PAIN_ZONES[2]; // stomach
  let selectedPainLevel = 'mild';

  let lastSpokenText = 'Yes, I slept well.';
  let spokenHistory = ['Yes, I slept well.', 'Water with straw please.', 'Thank you so much.'];
  let pinnedReplies = getPinnedReplies();
  let roleReplies = getOfflineRoleReplies('Did you sleep well?', patientLang);
  let chatMounted = false;

  let typeBuffer = '';
  let typePredictions = ['I need', 'Thank you', 'Please help', 'Water', 'Yes', 'No'];
  let typePredictionTimer = null;

  let isJudgeMode = true;
  let isHighContrast = false;
  let isLargeText = false;
  let speechDebounceTimer = null;
  let isAiRequestInFlight = false;
  let lastGazeSelectTime = 0;
  let lastGazeTarget = null;

  const isOnboarded = localStorage.getItem('gaze_voice_onboarded') === 'true';
  if (!isOnboarded) {
    mode = 'onboarding';
  }

  const history = [
    { speaker: 'other', text: 'Did you sleep well?' }
  ];

  // Rest state listener
  window.addEventListener('gaze:rest', (e) => {
    isResting = !!e.detail?.resting;
  });

  // Remote question listener from Caregiver Phone
  window.addEventListener('aac:remote-question', (e) => {
    const text = e.detail?.text;
    if (!text || !text.trim()) return;
    heardFrom = 'phone';
    heardText = text.trim();
    history.push({ speaker: 'other', text: heardText });
    handleNewUtterance(heardText, 'phone');
    render();
  });

  // External heard question listener (handles questions from judge mode / tests / external triggers)
  window.addEventListener('aac:heard', (e) => {
    const text = e.detail?.text;
    const source = e.detail?.source || 'external';
    if (source === 'mic' || source === 'phone' || source === 'internal') return;
    if (!text || !text.trim()) return;
    const normalized = text.toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (normalized === lastUtteranceNormalized) return;
    heardText = text.trim();
    heardFrom = source === 'phone' ? 'phone' : 'mic';
    history.push({ speaker: 'other', text: heardText });
    handleNewUtterance(heardText, 'internal');
    render();
  });

  // Fatigue listener
  window.addEventListener('gaze:fatigue', (e) => {
    const level = e.detail?.level;
    if (level === 'mild' || level === 'high') {
      fatigueAlert = level;
      render();
    }
  });

  // Speech recognition listener
  const listener = new SpeechListener({
    onTranscript: ({ text, isFinal }) => {
      heardText = text;
      heardFrom = 'mic';
      if (isFinal) {
        if (speechDebounceTimer) clearTimeout(speechDebounceTimer);
        speechDebounceTimer = setTimeout(() => {
          history.push({ speaker: 'other', text });
          handleNewUtterance(text, 'mic');
        }, 350);
      }
      render();
    },
    onStatusChange: (status) => {
      isListening = status.isListening;
      render();
    }
  });

  listener.start();

  async function handleNewUtterance(text, source = 'mic') {
    if (!text || !text.trim()) return;

    const words = text.trim().split(/\s+/).filter(Boolean);
    const isQuestion = text.trim().endsWith('?');
    if (words.length < 3 && !isQuestion) {
      return;
    }

    const normalized = text.toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (normalized === lastUtteranceNormalized) {
      return;
    }
    lastUtteranceNormalized = normalized;

    if (source !== 'internal') {
      window.dispatchEvent(new CustomEvent('aac:heard', { detail: { text, source } }));
    }
    isResting = false;

    // Instant offline role replies
    roleReplies = getOfflineRoleReplies(text, patientLang);
    isLoadingReplies = true;
    updateChatBoardInPlace();

    if (isAiRequestInFlight) return;
    isAiRequestInFlight = true;

    try {
      const aiReplies = await predictReplies({
        utterance: text,
        history,
        profile: memory,
        language: patientLang,
        tone: currentTone
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

    lastSpokenText = phraseText;
    if (!spokenHistory.includes(phraseText)) {
      spokenHistory.unshift(phraseText);
      if (spokenHistory.length > 5) spokenHistory.pop();
    }

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

    speakPhrase(textToSpeak, listenerLang, {
      tone: currentTone,
      onStart: () => listener.pauseForSpeech(),
      onEnd: () => listener.resumeAfterSpeech(500)
    });

    window.dispatchEvent(
      new CustomEvent('aac:spoken', {
        detail: {
          text: textToSpeak,
          lang: listenerLang,
          originalText: phraseText
        }
      })
    );

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

  function handlePainConfirm({ zone, level, score }) {
    const isHi = patientLang.startsWith('hi');
    const zoneName = isHi ? (zone?.labelHi || zone?.label || 'शरीर') : (zone?.label || 'body').toLowerCase();
    const scoreVal = parseInt(score || '5', 10);
    const levelStr = level || (scoreVal <= 3 ? 'mild' : scoreVal <= 6 ? 'moderate' : 'severe');

    const spokenText = isHi
      ? `मेरे ${zoneName} में दर्द है, ${levelStr === 'severe' ? 'बहुत तेज' : levelStr === 'moderate' ? 'मध्यम' : 'हल्का'}, 10 में से ${scoreVal}`
      : `My ${zoneName} hurts, ${levelStr}, ${scoreVal} out of 10.`;

    speakPhrase(spokenText, listenerLang, {
      tone: scoreVal >= 7 ? 'urgent' : currentTone,
      onStart: () => listener.pauseForSpeech(),
      onEnd: () => listener.resumeAfterSpeech(500)
    });

    window.dispatchEvent(
      new CustomEvent('aac:spoken', {
        detail: {
          text: spokenText,
          lang: listenerLang,
          originalText: spokenText
        }
      })
    );

    logPainRecord({
      zone: zone?.label || 'Body',
      level: levelStr,
      score: scoreVal
    });

    if (scoreVal >= 7) {
      window.dispatchEvent(
        new CustomEvent('aac:request', {
          detail: {
            kind: 'pain',
            label: `Severe ${zone?.label || 'body'} pain ${scoreVal}/10`
          }
        })
      );
    }

    history.push({ speaker: 'patient', text: spokenText });
    lastSpokenText = spokenText;
    if (!spokenHistory.includes(spokenText)) {
      spokenHistory.unshift(spokenText);
      if (spokenHistory.length > 5) spokenHistory.pop();
    }
    mode = 'chat';
    chatMounted = false;
    render();
  }

  function triggerEmergency() {
    isEmergency = true;
    startEmergencyAlarm();
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

  // Unified action handler
  function handleAction(target) {
    const action = target.dataset.action;
    const value = target.dataset.value;

    if (action === 'emergency') {
      triggerEmergency();
    } else if (action === 'dismiss-emergency') {
      dismissEmergency();
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
    } else if (action === 'open-more') {
      mode = 'more';
      chatMounted = false;
      render();
    } else if (action === 'reply') {
      handleSelectPhrase(value || target.querySelector('.conv-reply-text')?.textContent || target.textContent);
    } else if (action === 'toggle-pin') {
      const role = target.dataset.role;
      const text = target.dataset.text || roleReplies[role]?.text;
      pinnedReplies = togglePinnedReply(role, text, 'Pinned');
      updateChatBoardInPlace();
    } else if (action === 'nav-type' || action === 'open-keyboard') {
      mode = 'type';
      chatMounted = false;
      fetchTypePredictions(typeBuffer);
      render();
    } else if (action === 'nav-pain') {
      mode = 'pain';
      chatMounted = false;
      render();
    } else if (action === 'pain-zone-select') {
      selectedPainZone = PAIN_ZONES.find((z) => z.id === value) || PAIN_ZONES[0];
      mode = 'pain_scale';
      render();
    } else if (action === 'pain-to-exact') {
      mode = 'pain_exact';
      render();
    } else if (action === 'pain-confirm') {
      const score = target.dataset.score || value || '8';
      const level = target.dataset.level || (score <= 3 ? 'mild' : score <= 6 ? 'moderate' : 'severe');
      handlePainConfirm({ zone: selectedPainZone, level, score });
    } else if (action === 'nav-categories') {
      mode = 'categories';
      chatMounted = false;
      render();
    } else if (action === 'category-select') {
      activeCategory = CATEGORIES.find((c) => c.id === value) || null;
      mode = 'category_items';
      render();
    } else if (action === 'nav-home') {
      mode = 'home_requests';
      chatMounted = false;
      render();
    } else if (action === 'home-request') {
      dispatchHomeRequest(target.dataset.kind, target.dataset.label);
      handleSelectPhrase(target.dataset.text, 'request', 'home');
    } else if (action === 'nav-pinned') {
      mode = 'pinned_list';
      chatMounted = false;
      render();
    } else if (action === 'nav-history') {
      mode = 'history_list';
      chatMounted = false;
      render();
    } else if (action === 'nav-tone') {
      mode = 'tone_picker';
      chatMounted = false;
      render();
    } else if (action === 'select-tone') {
      currentTone = value || 'gentle';
      setSelectedTone(currentTone);
      mode = 'chat';
      chatMounted = false;
      render();
    } else if (action === 'toggle-audio') {
      if (isAudioStopped) {
        listener.start();
        isAudioStopped = false;
      } else {
        window.speechSynthesis.cancel();
        listener.stop();
        isAudioStopped = true;
      }
      render();
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
        dispatchHomeRequest(item.kind, item.label);
        handleSelectPhrase(item.text, 'request', 'home');
      } else {
        handleSelectPhrase(item.text, 'topic', activeTopic?.id || 'general');
      }
    } else if (action === 'nav-back') {
      if (mode === 'category_items') {
        mode = 'categories';
      } else if (mode === 'topic_items') {
        mode = 'topics';
      } else if (mode === 'pain_exact' || mode === 'pain_scale') {
        mode = 'pain';
      } else {
        mode = 'chat';
        chatMounted = false;
      }
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
    } else if (action === 'open-caregiver-menu') {
      showCaregiverMenu = true;
      render();
    } else if (action === 'close-caregiver-menu') {
      showCaregiverMenu = false;
      render();
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
    } else if (action === 'open-profile') {
      showCaregiverMenu = false;
      mode = 'profile';
      chatMounted = false;
      render();
    } else if (action === 'close-profile') {
      mode = 'chat';
      chatMounted = false;
      render();
    } else if (action === 'open-summary') {
      showCaregiverMenu = false;
      openSummaryView();
    } else if (action === 'close-summary') {
      mode = 'chat';
      chatMounted = false;
      render();
    }
  }

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
    const actionEl = e.target.closest('[data-action], [data-gaze-target], .conv-menu-btn, .conv-btn, .conv-modal-close');
    if (!actionEl) return;
    const now = performance.now();
    if (actionEl === lastGazeTarget && now - lastGazeSelectTime < 300) {
      return;
    }
    handleAction(actionEl);
  }

  app.addEventListener('gaze-select', onGazeSelect);
  app.addEventListener('click', onClick);

  function renderCaregiverMenuModal() {
    let container = app.querySelector('.conv-caregiver-modal-container');
    if (!showCaregiverMenu) {
      if (container) container.remove();
      return;
    }
    if (!container) {
      container = document.createElement('div');
      container.className = 'conv-caregiver-modal-container';
      app.appendChild(container);
    }
    const listenerObj = LISTENER_LANGUAGES.find((l) => l.code === listenerLang) || LISTENER_LANGUAGES[0];
    container.innerHTML = `
      <div class="conv-modal-overlay">
        <div class="conv-modal-card">
          <div class="conv-modal-header">
            <h2 class="conv-modal-title">Caregiver Settings</h2>
            <button class="conv-modal-close" data-action="close-caregiver-menu">Close</button>
          </div>
          
          <div class="conv-setting-row">
            <div>
              <div class="conv-setting-label">Microphone Listening</div>
              <div class="conv-setting-desc">Continuous room audio capture</div>
            </div>
            <button class="conv-btn ${isListening ? 'btn-active' : ''}" data-action="toggle-mic">
              ${isListening ? 'Active' : 'Paused'}
            </button>
          </div>

          <div class="conv-setting-row">
            <div>
              <div class="conv-setting-label">Patient Language</div>
              <div class="conv-setting-desc">Recognition & prediction language</div>
            </div>
            <button class="conv-btn btn-active" data-action="toggle-lang">
              ${patientLang === 'en-IN' ? 'English (India)' : 'Hindi'}
            </button>
          </div>

          <div class="conv-setting-row">
            <div>
              <div class="conv-setting-label">Listener Voice Language</div>
              <div class="conv-setting-desc">Spoken output translation</div>
            </div>
            <button class="conv-btn btn-active" data-action="toggle-listener-lang">
              ${escapeHtml(listenerObj.name)}
            </button>
          </div>

          <div class="conv-setting-row">
            <div>
              <div class="conv-setting-label">High Contrast</div>
              <div class="conv-setting-desc">High visibility border styling</div>
            </div>
            <button class="conv-btn ${isHighContrast ? 'btn-active' : ''}" data-action="toggle-contrast">
              ${isHighContrast ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          <div class="conv-setting-row">
            <div>
              <div class="conv-setting-label">Large Text</div>
              <div class="conv-setting-desc">Increase font sizing</div>
            </div>
            <button class="conv-btn ${isLargeText ? 'btn-active' : ''}" data-action="toggle-size">
              ${isLargeText ? 'Large' : 'Normal'}
            </button>
          </div>

          <div class="conv-setting-row">
            <div>
              <div class="conv-setting-label">Judge Demo Prompt</div>
              <div class="conv-setting-desc">Subtle helper line below question</div>
            </div>
            <button class="conv-btn ${isJudgeMode ? 'btn-active' : ''}" data-action="toggle-demo">
              ${isJudgeMode ? 'Visible' : 'Hidden'}
            </button>
          </div>

          <div style="padding: 12px 0; border-bottom: 1px solid rgba(42, 46, 54, 0.5);">
            <div class="conv-setting-label" style="margin-bottom:8px;">Ask a Question</div>
            <div style="display:flex; gap:8px;">
              <input type="text" id="manual-utterance" class="conv-input" placeholder="Type question for patient..." />
              <button class="conv-btn btn-primary" id="btn-submit-manual">Ask</button>
            </div>
          </div>

          <div style="display:flex; gap:12px; margin-top:8px;">
            <button class="conv-btn" data-action="open-profile" style="flex:1;">Patient Profile & Meds</button>
            <button class="conv-btn" data-action="open-summary" style="flex:1;">Daily Medical Summary</button>
          </div>
        </div>
      </div>
    `;
    hookManualInput();
  }

  // In-place stable board updater
  function updateChatBoardInPlace() {
    if (mode !== 'chat' || isEmergency) {
      render();
      return;
    }

    const hero = app.querySelector('.conv-hero-grid');
    if (!hero) {
      render();
      return;
    }

    // 1. Update heard question
    const heardEl = app.querySelector('.conv-heard-text');
    if (heardEl) {
      const displayTxt = heardText || (isListening ? 'Listening...' : 'Microphone paused');
      if (heardEl.textContent.trim() !== displayTxt) {
        heardEl.textContent = displayTxt;
      }
    }

    const phoneBadge = app.querySelector('.conv-phone-badge');
    if (phoneBadge) {
      phoneBadge.style.display = heardFrom === 'phone' ? 'inline-block' : 'none';
    }

    // 2. Update the 6 hero slot tiles in place
    const roles = ['agree', 'decline', 'need', 'feeling', 'ask_back', 'other'];
    for (const role of roles) {
      const slotEl = app.querySelector(`#slot-${role}`);
      if (!slotEl) continue;

      const isPinned = !!pinnedReplies[role];
      const data = isPinned ? pinnedReplies[role] : roleReplies[role];
      if (!data) continue;

      const text = data.text;
      slotEl.classList.toggle('is-pinned', isPinned);
      slotEl.dataset.value = text;
      slotEl.dataset.role = role;

      const textEl = slotEl.querySelector('.conv-reply-text');
      if (textEl && textEl.textContent !== text) {
        textEl.textContent = text;
      }

      const pinBtn = slotEl.querySelector('.conv-pin-btn');
      if (pinBtn) {
        pinBtn.dataset.role = role;
        pinBtn.dataset.text = text;
        pinBtn.title = isPinned ? 'Unpin' : 'Pin';
      }
    }

    renderCaregiverMenuModal();
  }

  function render() {
    app.classList.toggle('contrast-high', isHighContrast);
    app.classList.toggle('text-large', isLargeText);

    if (mode === 'chat' && chatMounted && app.querySelector('.conv-hero-grid')) {
      updateChatBoardInPlace();
      return;
    }

    const isHi = patientLang.startsWith('hi');
    const listenerObj = LISTENER_LANGUAGES.find((l) => l.code === listenerLang) || LISTENER_LANGUAGES[0];

    // 1. Emergency Fullscreen Alert
    if (isEmergency) {
      app.innerHTML = `
        <div class="conv-emergency-modal">
          <div class="conv-emergency-title">PATIENT NEEDS ASSISTANCE</div>
          <div class="conv-emergency-details">
            <strong>${escapeHtml(memory.name)}</strong> · ${escapeHtml(memory.condition)}<br/>
            Medications: ${escapeHtml(memory.meds)}<br/>
            Contacts: ${escapeHtml(memory.familyNames)}
          </div>
          <button class="conv-emergency-dismiss" data-gaze-target data-gaze-dwell="1200" data-action="dismiss-emergency">
            Dismiss Alarm
            <div class="conv-tile-dwell-ring"></div>
          </button>
        </div>
      `;
      return;
    }

    // 2. Onboarding Modal (First Run)
    if (mode === 'onboarding') {
      app.innerHTML = `
        <div class="conv-modal-overlay">
          <div class="conv-modal-card">
            <div class="conv-modal-header">
              <h2 class="conv-modal-title">Patient Profile Setup</h2>
            </div>
            <p style="color:var(--conv-text-muted); font-size:14px; margin:0;">
              Configure patient details to enable personal AI replies and medication tracking.
            </p>
            <div>
              <label class="conv-setting-label">Patient Name</label>
              <input type="text" id="onboard-name" class="conv-input" value="${escapeHtml(memory.name)}" style="margin-top:4px;" />
            </div>
            <div>
              <label class="conv-setting-label">Condition & Needs</label>
              <input type="text" id="onboard-condition" class="conv-input" value="${escapeHtml(memory.condition)}" style="margin-top:4px;" />
            </div>
            <div>
              <label class="conv-setting-label">Family & Caregivers</label>
              <input type="text" id="onboard-family" class="conv-input" value="${escapeHtml(memory.familyNames)}" style="margin-top:4px;" />
            </div>
            <div>
              <label class="conv-setting-label">Scheduled Meds & Times</label>
              <input type="text" id="onboard-meds" class="conv-input" value="${escapeHtml(memory.meds)}" style="margin-top:4px;" />
            </div>
            <div>
              <label class="conv-setting-label">Likes & Interests</label>
              <input type="text" id="onboard-likes" class="conv-input" value="${escapeHtml(memory.likes)}" style="margin-top:4px;" />
            </div>
            <div style="display:flex; justify-content:flex-end; margin-top:8px;">
              <button class="conv-btn btn-primary" id="btn-save-onboarding" style="padding:10px 28px; font-size:15px;">
                Start
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

    // 3. Clinical Summary Modal
    if (mode === 'summary') {
      app.innerHTML = `
        <div class="conv-modal-overlay">
          <div class="conv-modal-card" style="max-width:760px;">
            <div class="conv-modal-header">
              <h2 class="conv-modal-title">Daily Medical & Care Summary</h2>
              <button class="conv-modal-close" data-action="close-summary">Close</button>
            </div>
            ${
              isLoadingSummary
                ? '<div style="padding:40px; text-align:center; color:var(--conv-accent);">Generating clinical report...</div>'
                : `<pre style="white-space:pre-wrap; font-family:inherit; font-size:14px; line-height:1.5; color:#cbd5e1; margin:0;">${escapeHtml(summaryReport)}</pre>`
            }
            <div style="display:flex; justify-content:flex-end; gap:8px;">
              <button class="conv-btn" id="btn-copy-summary">Copy Report</button>
              <button class="conv-btn" id="btn-print-summary">Print / PDF</button>
              <button class="conv-btn btn-primary" data-action="close-summary">Close</button>
            </div>
          </div>
        </div>
      `;
      const btnCopy = app.querySelector('#btn-copy-summary');
      if (btnCopy) {
        btnCopy.onclick = () => {
          navigator.clipboard.writeText(summaryReport);
          btnCopy.textContent = 'Copied';
          setTimeout(() => { btnCopy.textContent = 'Copy Report'; }, 2000);
        };
      }
      const btnPrint = app.querySelector('#btn-print-summary');
      if (btnPrint) {
        btnPrint.onclick = () => window.print();
      }
      return;
    }

    // 4. Patient Profile Settings Modal
    if (mode === 'profile') {
      app.innerHTML = `
        <div class="conv-modal-overlay">
          <div class="conv-modal-card">
            <div class="conv-modal-header">
              <h2 class="conv-modal-title">Patient Profile & Memory</h2>
              <button class="conv-modal-close" data-action="close-profile">Close</button>
            </div>
            <div>
              <label class="conv-setting-label">Patient Name</label>
              <input type="text" id="prof-name" class="conv-input" value="${escapeHtml(memory.name)}" />
            </div>
            <div>
              <label class="conv-setting-label">Condition & Needs</label>
              <input type="text" id="prof-condition" class="conv-input" value="${escapeHtml(memory.condition)}" />
            </div>
            <div>
              <label class="conv-setting-label">Family & Doctors</label>
              <input type="text" id="prof-family" class="conv-input" value="${escapeHtml(memory.familyNames)}" />
            </div>
            <div>
              <label class="conv-setting-label">Daily Meds & Schedule</label>
              <input type="text" id="prof-meds" class="conv-input" value="${escapeHtml(memory.meds)}" />
            </div>
            <div>
              <label class="conv-setting-label">Personal Likes</label>
              <input type="text" id="prof-likes" class="conv-input" value="${escapeHtml(memory.likes)}" />
            </div>
            <div>
              <label class="conv-setting-label">Clinical Notes</label>
              <textarea id="prof-notes" class="conv-input" rows="2">${escapeHtml(memory.notes || '')}</textarea>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px;">
              <button class="conv-btn btn-primary" id="btn-save-profile">Save Changes</button>
              <button class="conv-btn" data-action="close-profile">Close</button>
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
            usualNeeds: memory.usualNeeds,
            notes: app.querySelector('#prof-notes').value
          };
          saveMemory(memory);
          mode = 'chat';
          render();
        };
      }
      return;
    }



    // ========================================================================
    // MAIN SCREEN (mode === 'chat'): 3 BANDS
    // ========================================================================
    if (mode === 'chat') {
      const roles = ['agree', 'decline', 'need', 'feeling', 'ask_back', 'other'];

      app.innerHTML = `
        <!-- Top Bar (~56px): Heard Question + Quiet Caregiver Menu -->
        <header class="conv-topbar">
          <div class="conv-heard-area">
            <div class="conv-heard-row">
              <span class="conv-heard-text ${heardText ? '' : 'placeholder'}">
                ${escapeHtml(heardText || (isListening ? 'Listening...' : 'Microphone paused'))}
              </span>
              <span class="conv-phone-badge" style="display: ${heardFrom === 'phone' ? 'inline-block' : 'none'};">From phone</span>
            </div>
            ${isJudgeMode ? '<div class="conv-demo-prompt">Ask: "Did you sleep well?" · Hover any reply to speak</div>' : ''}
          </div>
          <button class="conv-menu-btn" data-action="open-caregiver-menu" aria-label="Caregiver Menu">
            ${ICONS.menu} Menu
          </button>
        </header>

        <!-- Main Screen Body: Hero (65% height, 6 tiles) + Bottom Row (6 tiles) -->
        <div class="conv-main-layout">
          <!-- Hero Grid (3x2, neutral surface, 30px semibold text, no labels, no icons) -->
          <div class="conv-hero-grid">
            ${roles.map((role) => {
              const isPinned = !!pinnedReplies[role];
              const data = isPinned ? pinnedReplies[role] : roleReplies[role];
              const text = data?.text || '';
              return `
                <div class="conv-reply-tile ${isPinned ? 'is-pinned' : ''}" id="slot-${role}" data-gaze-target data-action="reply" data-role="${role}" data-value="${escapeHtml(text)}">
                  <span class="conv-reply-text">${escapeHtml(text)}</span>
                  <button class="conv-pin-btn" data-action="toggle-pin" data-role="${role}" data-text="${escapeHtml(text)}" title="${isPinned ? 'Unpin' : 'Pin'}">
                    ${ICONS.pin}
                  </button>
                  <div class="conv-tile-dwell-ring"></div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Bottom Row (6 Equal Tiles: Yes, No, Wait, Keyboard, More, Emergency) -->
          <div class="conv-bottom-row">
            <button class="conv-action-tile tile-yes" data-gaze-target data-action="core-yes">
              <span>${isHi ? 'हाँ' : 'Yes'}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
            <button class="conv-action-tile tile-no" data-gaze-target data-action="core-no">
              <span>${isHi ? 'नहीं' : 'No'}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
            <button class="conv-action-tile" data-gaze-target data-action="core-wait">
              <span>${isHi ? 'रुकिए' : 'Wait'}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
            <button class="conv-action-tile" data-gaze-target data-action="nav-type">
              ${ICONS.keyboard}
              <span>${isHi ? 'कीबोर्ड' : 'Keyboard'}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
            <button class="conv-action-tile" data-gaze-target data-action="open-more">
              ${ICONS.more}
              <span>${isHi ? 'अन्य' : 'More'}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
            <button class="conv-action-tile tile-emergency conv-tile-emergency" data-gaze-target data-gaze-always="1" data-gaze-dwell="2000" data-action="emergency">
              ${ICONS.emergency}
              <span>${isHi ? 'आपातकाल' : 'Emergency'}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
          </div>
        </div>
      `;

      chatMounted = true;
      renderCaregiverMenuModal();
      return;
    }

    // ========================================================================
    // MORE PANEL (mode === 'more')
    // ========================================================================
    if (mode === 'more') {
      app.innerHTML = `
        <header class="conv-topbar">
          <div class="conv-heard-area">
            <div class="conv-heard-text">More Options</div>
          </div>
          <button class="conv-menu-btn" data-action="nav-back">Back to Chat</button>
        </header>

        <div class="conv-panel-view">
          <div class="conv-panel-grid">
            <button class="conv-panel-tile" data-gaze-target data-action="nav-pain">
              <span>Pain Map</span>
              <span class="panel-tile-sub">8 body zones & 0-10 scale</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>

            <button class="conv-panel-tile" data-gaze-target data-action="nav-categories">
              <span>Categories</span>
              <span class="panel-tile-sub">Needs, feelings, people</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>

            <button class="conv-panel-tile" data-gaze-target data-action="nav-home">
              <span>Home & Nurse</span>
              <span class="panel-tile-sub">Lights, fan, call nurse</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>

            <button class="conv-panel-tile" data-gaze-target data-action="nav-pinned">
              <span>Pinned Phrases</span>
              <span class="panel-tile-sub">${Object.keys(pinnedReplies).length} pinned</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>

            <button class="conv-panel-tile" data-gaze-target data-action="nav-history">
              <span>History</span>
              <span class="panel-tile-sub">Recent spoken phrases</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>

            <button class="conv-panel-tile" data-gaze-target data-action="nav-tone">
              <span>Tone</span>
              <span class="panel-tile-sub">Current: ${currentTone}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>

            <button class="conv-panel-tile" data-gaze-target data-action="toggle-audio">
              <span>${isAudioStopped ? 'Start Listening' : 'Stop Listening'}</span>
              <span class="panel-tile-sub">${isAudioStopped ? 'Mic currently paused' : 'Mic active'}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>

            <button class="conv-panel-tile" data-gaze-target data-action="core-repeat" data-value="${escapeHtml(lastSpokenText)}">
              <span>Repeat Last</span>
              <span class="panel-tile-sub">"${escapeHtml(lastSpokenText || 'None')}"</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>

            <button class="conv-panel-tile" data-gaze-target data-action="nav-topics">
              <span>I Want to Say</span>
              <span class="panel-tile-sub">Conversation topics</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>

            <button class="conv-panel-tile" data-gaze-target data-action="nav-back">
              <span>Back to Chat</span>
              <span class="panel-tile-sub">Return to replies</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
          </div>
        </div>
      `;
      renderCaregiverMenuModal();
      return;
    }

    // ========================================================================
    // HOME & NURSE REQUESTS (mode === 'home_requests')
    // ========================================================================
    if (mode === 'home_requests') {
      app.innerHTML = `
        <header class="conv-topbar">
          <div class="conv-heard-area">
            <div class="conv-heard-text">Home & Nurse Requests</div>
          </div>
          <button class="conv-menu-btn" data-action="nav-back">Back</button>
        </header>

        <div class="conv-panel-view">
          <div class="conv-panel-grid">
            <button class="conv-panel-tile" data-gaze-target data-action="home-request" data-kind="lights" data-label="Lights On" data-text="Turn on the lights">
              <span>Turn On Lights</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
            <button class="conv-panel-tile" data-gaze-target data-action="home-request" data-kind="lights" data-label="Lights Off" data-text="Turn off the lights">
              <span>Turn Off Lights</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
            <button class="conv-panel-tile" data-gaze-target data-action="home-request" data-kind="fan" data-label="Fan On" data-text="Turn on the fan">
              <span>Turn On Fan</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
            <button class="conv-panel-tile" data-gaze-target data-action="home-request" data-kind="fan" data-label="Fan Off" data-text="Turn off the fan">
              <span>Turn Off Fan</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
            <button class="conv-panel-tile" data-gaze-target data-action="home-request" data-kind="nurse" data-label="Call Nurse" data-text="Call Nurse immediately" style="border-color:#f59e0b;">
              <span>Call Nurse</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
            <button class="conv-panel-tile" data-gaze-target data-action="nav-back">
              <span>Back to Chat</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
          </div>
        </div>
      `;
      return;
    }

    // ========================================================================
    // TONE PICKER (mode === 'tone_picker')
    // ========================================================================
    if (mode === 'tone_picker') {
      const tones = [
        { id: 'gentle', title: 'Gentle', desc: 'Warm, calm and soft-spoken' },
        { id: 'urgent', title: 'Urgent', desc: 'Fast, direct and pressing' },
        { id: 'joking', title: 'Joking', desc: 'Lighthearted and playful' },
        { id: 'formal', title: 'Formal', desc: 'Polite and dignified' }
      ];

      app.innerHTML = `
        <header class="conv-topbar">
          <div class="conv-heard-area">
            <div class="conv-heard-text">Expression Tone</div>
          </div>
          <button class="conv-menu-btn" data-action="nav-back">Back</button>
        </header>

        <div class="conv-panel-view">
          <div class="conv-panel-grid" style="grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 1fr);">
            ${tones.map((t) => `
              <button class="conv-panel-tile ${currentTone === t.id ? 'is-active' : ''}" data-gaze-target data-action="select-tone" data-value="${t.id}">
                <span>${t.title}</span>
                <span class="panel-tile-sub">${t.desc}</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
            `).join('')}
          </div>
        </div>
      `;
      return;
    }

    // ========================================================================
    // PINNED PHRASES (mode === 'pinned_list')
    // ========================================================================
    if (mode === 'pinned_list') {
      const pins = Object.entries(pinnedReplies);

      app.innerHTML = `
        <header class="conv-topbar">
          <div class="conv-heard-area">
            <div class="conv-heard-text">Pinned Phrases</div>
          </div>
          <button class="conv-menu-btn" data-action="nav-back">Back</button>
        </header>

        <div class="conv-panel-view">
          <div class="conv-panel-grid">
            ${
              pins.length > 0
                ? pins.map(([role, item]) => `
                <button class="conv-panel-tile" data-gaze-target data-action="reply" data-value="${escapeHtml(item.text)}">
                  <span>"${escapeHtml(item.text)}"</span>
                  <span class="panel-tile-sub">Pinned (${role})</span>
                  <div class="conv-tile-dwell-ring"></div>
                </button>
              `).join('')
                : '<div style="grid-column: span 5; padding: 40px; text-align: center; color: var(--conv-text-muted);">No pinned phrases yet. Hover a reply card to pin it.</div>'
            }
            <button class="conv-panel-tile" data-gaze-target data-action="nav-back">
              <span>Back to Chat</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
          </div>
        </div>
      `;
      return;
    }

    // ========================================================================
    // HISTORY LIST (mode === 'history_list')
    // ========================================================================
    if (mode === 'history_list') {
      app.innerHTML = `
        <header class="conv-topbar">
          <div class="conv-heard-area">
            <div class="conv-heard-text">Spoken History</div>
          </div>
          <button class="conv-menu-btn" data-action="nav-back">Back</button>
        </header>

        <div class="conv-panel-view">
          <div class="conv-panel-grid">
            ${spokenHistory.map((phrase) => `
              <button class="conv-panel-tile" data-gaze-target data-action="reply" data-value="${escapeHtml(phrase)}">
                <span>"${escapeHtml(phrase)}"</span>
                <span class="panel-tile-sub">Speak again</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
            `).join('')}
            <button class="conv-panel-tile" data-gaze-target data-action="nav-back">
              <span>Back to Chat</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
          </div>
        </div>
      `;
      return;
    }

    // ========================================================================
    // PAIN MAP (mode === 'pain')
    // ========================================================================
    if (mode === 'pain') {
      app.innerHTML = `
        <header class="conv-topbar">
          <div class="conv-heard-area">
            <div class="conv-heard-text">Pain Map — Select Body Zone</div>
          </div>
          <button class="conv-menu-btn" data-action="nav-back">Back</button>
        </header>

        <div class="conv-panel-view">
          <div class="conv-pain-grid-4x2 conv-pain-board">
            ${PAIN_ZONES.map((z) => `
              <button class="conv-pain-tile" data-gaze-target data-action="pain-zone-select" data-value="${z.id}">
                <span class="conv-pain-name conv-pain-label">${isHi ? z.labelHi : z.label}</span>
                <span class="conv-pain-desc">${z.desc}</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
            `).join('')}
          </div>
        </div>
      `;
      return;
    }

    // ========================================================================
    // PAIN SCALE (mode === 'pain_scale')
    // ========================================================================
    if (mode === 'pain_scale') {
      const zone = selectedPainZone || PAIN_ZONES[2];

      app.innerHTML = `
        <header class="conv-topbar">
          <div class="conv-heard-area">
            <div class="conv-heard-text">${zone.label} Pain — Select Severity</div>
          </div>
          <button class="conv-menu-btn" data-action="nav-pain">Change Zone</button>
        </header>

        <div class="conv-panel-view">
          <div class="conv-pain-scale-3 conv-pain-scale-container">
            <button class="conv-scale-tile conv-pain-scale-tile scale-mild" data-gaze-target data-action="pain-confirm" data-level="mild" data-score="2">
              <span class="conv-scale-score">2</span>
              <span class="conv-scale-name conv-scale-title">Mild (1–3)</span>
              <span class="conv-scale-info">Tolerable discomfort</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>

            <button class="conv-scale-tile conv-pain-scale-tile scale-moderate" data-gaze-target data-action="pain-confirm" data-level="moderate" data-score="5">
              <span class="conv-scale-score">5</span>
              <span class="conv-scale-name conv-scale-title">Moderate (4–6)</span>
              <span class="conv-scale-info">Noticeable pain</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>

            <button class="conv-scale-tile conv-pain-scale-tile scale-severe" data-gaze-target data-action="pain-confirm" data-level="severe" data-score="8">
              <span class="conv-scale-score">8</span>
              <span class="conv-scale-name conv-scale-title">Severe (7–10)</span>
              <span class="conv-scale-info">Alerts caregiver phone</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
          </div>

          <div style="display:flex; gap:12px; height:56px;">
            <button class="conv-panel-tile" data-gaze-target data-action="pain-to-exact" style="flex:1;">
              <span>Exact Number (0–10)</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
            <button class="conv-panel-tile" data-gaze-target data-action="nav-pain" style="flex:1;">
              <span>Change Body Zone</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
          </div>
        </div>
      `;
      return;
    }

    // ========================================================================
    // PAIN EXACT (mode === 'pain_exact')
    // ========================================================================
    if (mode === 'pain_exact') {
      const zone = selectedPainZone || PAIN_ZONES[2];
      const numbers = [
        { score: 0, level: 'none', label: '0 None' },
        { score: 1, level: 'mild', label: '1 Mild' },
        { score: 2, level: 'mild', label: '2 Mild' },
        { score: 3, level: 'mild', label: '3 Mild' },
        { score: 4, level: 'moderate', label: '4 Mod' },
        { score: 5, level: 'moderate', label: '5 Mod' },
        { score: 6, level: 'moderate', label: '6 Mod' },
        { score: 7, level: 'severe', label: '7 Severe' },
        { score: 8, level: 'severe', label: '8 Severe' },
        { score: 9, level: 'severe', label: '9 Critical' },
        { score: 10, level: 'severe', label: '10 Extreme' },
        { score: 'back', level: 'back', label: 'Back' }
      ];

      app.innerHTML = `
        <header class="conv-topbar">
          <div class="conv-heard-area">
            <div class="conv-heard-text">${zone.label} — Pick Exact Score</div>
          </div>
          <button class="conv-menu-btn" data-action="nav-pain">Back</button>
        </header>

        <div class="conv-panel-view">
          <div class="conv-panel-grid" style="grid-template-columns: repeat(6, 1fr); grid-template-rows: repeat(2, 1fr);">
            ${numbers.map((item) => {
              if (item.score === 'back') {
                return `
                  <button class="conv-panel-tile" data-gaze-target data-action="nav-pain">
                    <span>Back</span>
                    <div class="conv-tile-dwell-ring"></div>
                  </button>
                `;
              }
              const isSevere = item.score >= 7;
              return `
                <button class="conv-panel-tile ${isSevere ? 'tile-emergency' : ''}" data-gaze-target data-action="pain-confirm" data-score="${item.score}" data-level="${item.level}">
                  <span style="font-size:26px;">${item.score}</span>
                  <span class="panel-tile-sub">${item.label}</span>
                  <div class="conv-tile-dwell-ring"></div>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `;
      return;
    }

    // ========================================================================
    // CATEGORIES (mode === 'categories')
    // ========================================================================
    if (mode === 'categories') {
      app.innerHTML = `
        <header class="conv-topbar">
          <div class="conv-heard-area">
            <div class="conv-heard-text">Category Library</div>
          </div>
          <button class="conv-menu-btn" data-action="nav-back">Back</button>
        </header>

        <div class="conv-panel-view">
          <div class="conv-panel-grid">
            ${CATEGORIES.map((c) => `
              <button class="conv-panel-tile" data-gaze-target data-action="category-select" data-value="${c.id}">
                <span>${isHi ? c.labelHi : c.label}</span>
                <span class="panel-tile-sub">${c.tag}</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
            `).join('')}
            <button class="conv-panel-tile" data-gaze-target data-action="nav-back">
              <span>Back to Chat</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
          </div>
        </div>
      `;
      return;
    }

    // ========================================================================
    // CATEGORY ITEMS (mode === 'category_items')
    // ========================================================================
    if (mode === 'category_items') {
      const currentCat = activeCategory || CATEGORIES[0];
      const phrases = (isHi ? currentCat.phrases['hi-IN'] : currentCat.phrases['en-IN']) || [];

      app.innerHTML = `
        <header class="conv-topbar">
          <div class="conv-heard-area">
            <div class="conv-heard-text">${currentCat.label} Phrases</div>
          </div>
          <button class="conv-menu-btn" data-action="nav-categories">Back</button>
        </header>

        <div class="conv-panel-view">
          <div class="conv-panel-grid">
            ${phrases.slice(0, 6).map((p) => `
              <button class="conv-panel-tile" data-gaze-target data-action="reply" data-value="${escapeHtml(p)}">
                <span>${escapeHtml(p)}</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
            `).join('')}
          </div>
        </div>
      `;
      return;
    }

    // ========================================================================
    // TOPICS (mode === 'topics')
    // ========================================================================
    if (mode === 'topics') {
      app.innerHTML = `
        <header class="conv-topbar">
          <div class="conv-heard-area">
            <div class="conv-heard-text">Conversation Starters</div>
          </div>
          <button class="conv-menu-btn" data-action="nav-back">Back</button>
        </header>

        <div class="conv-panel-view">
          <div class="conv-panel-grid">
            ${TOPICS.map((t) => `
              <button class="conv-panel-tile" data-gaze-target data-action="topic-select" data-value="${t.id}">
                <span>${t.label}</span>
                <span class="panel-tile-sub">${t.tag}</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
            `).join('')}
            <button class="conv-panel-tile" data-gaze-target data-action="nav-back">
              <span>Back to Chat</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
          </div>
        </div>
      `;
      return;
    }

    // ========================================================================
    // TOPIC ITEMS (mode === 'topic_items')
    // ========================================================================
    if (mode === 'topic_items') {
      const topic = activeTopic || TOPICS[0];

      app.innerHTML = `
        <header class="conv-topbar">
          <div class="conv-heard-area">
            <div class="conv-heard-text">${topic.label}</div>
          </div>
          <button class="conv-menu-btn" data-action="nav-topics">Back</button>
        </header>

        <div class="conv-panel-view">
          <div class="conv-panel-grid">
            ${topic.tiles.map((item) => `
              <button class="conv-panel-tile" data-gaze-target data-action="topic-item-select" data-value='${escapeHtml(JSON.stringify(item))}'>
                <span>${escapeHtml(item.text)}</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
            `).join('')}
          </div>
        </div>
      `;
      return;
    }

    // ========================================================================
    // KEYBOARD VIEW (mode === 'type')
    // ========================================================================
    if (mode === 'type') {
      app.innerHTML = `
        <header class="conv-topbar">
          <div class="conv-heard-area">
            <div class="conv-heard-text">Keyboard</div>
          </div>
          <button class="conv-menu-btn" data-action="nav-back">Back to Chat</button>
        </header>

        <div class="conv-keyboard-view">
          <div class="conv-type-strip">
            <div class="conv-type-buffer">
              ${typeBuffer ? escapeHtml(typeBuffer) : '<span style="color:var(--conv-text-muted);">Glance at letters to compose...</span>'}
            </div>
            <div style="font-size:14px; color:var(--conv-text-muted);">
              ${typeBuffer.length} chars
            </div>
          </div>

          <div class="conv-type-preds">
            ${typePredictions.slice(0, 5).map((word) => `
              <button class="conv-pred-btn" data-gaze-target data-action="type-prediction" data-value="${escapeHtml(word)}">
                <span>${escapeHtml(word)}</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
            `).join('')}
          </div>

          <div class="conv-qwerty-box">
            <!-- Row 1 -->
            <div class="conv-qwerty-row">
              ${['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map((k) => `
                <button class="conv-key-tile" data-gaze-target data-action="type-key" data-value="${k}">
                  <span>${k}</span>
                  <div class="conv-tile-dwell-ring"></div>
                </button>
              `).join('')}
            </div>

            <!-- Row 2 -->
            <div class="conv-qwerty-row">
              ${['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'].map((k) => `
                <button class="conv-key-tile" data-gaze-target data-action="type-key" data-value="${k}">
                  <span>${k}</span>
                  <div class="conv-tile-dwell-ring"></div>
                </button>
              `).join('')}
            </div>

            <!-- Row 3 -->
            <div class="conv-qwerty-row">
              ${['Z', 'X', 'C', 'V', 'B', 'N', 'M'].map((k) => `
                <button class="conv-key-tile" data-gaze-target data-action="type-key" data-value="${k}">
                  <span>${k}</span>
                  <div class="conv-tile-dwell-ring"></div>
                </button>
              `).join('')}
              <button class="conv-key-tile key-wide-2" data-gaze-target data-action="type-backspace">
                <span>Delete</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
            </div>

            <!-- Row 4 -->
            <div class="conv-qwerty-row">
              <button class="conv-key-tile key-wide-2" data-gaze-target data-action="type-clear">
                <span>Clear</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
              <button class="conv-key-tile key-wide-4" data-gaze-target data-action="type-space">
                <span>Space</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
              <button class="conv-key-tile key-wide-3 key-action-speak" data-gaze-target data-action="type-speak">
                <span>Speak</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
              <button class="conv-key-tile key-wide-2" data-gaze-target data-action="nav-back">
                <span>Back</span>
                <div class="conv-tile-dwell-ring"></div>
              </button>
            </div>
          </div>
        </div>
      `;
      return;
    }

    hookManualInput();
  }

  function hookManualInput() {
    const btnSubmit = app.querySelector('#btn-submit-manual');
    const inputManual = app.querySelector('#manual-utterance');
    if (btnSubmit && inputManual) {
      const submit = () => {
        const text = inputManual.value.trim();
        if (text) {
          heardText = text;
          heardFrom = 'mic';
          history.push({ speaker: 'other', text });
          handleNewUtterance(text, 'mic');
          showCaregiverMenu = false;
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

  render();
}
