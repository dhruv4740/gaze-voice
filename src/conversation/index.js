// Team B (teammate) owns everything in src/conversation/.
// Implements the complete AAC conversation interface: layout, speech recognition,
// Groq & Gemini replies, speech synthesis, categories, patient profile, spell mode, emergency.
// Contract events (window 'aac:spoken', 'aac:emergency', 'aac:request', 'gaze:fatigue').

import './conversation.css';
import { getMemory, saveMemory, logInteraction, getDailyLog } from './memory.js';
import { CATEGORIES, getOfflineReplies } from './categories.js';
import { predictReplies } from './groq.js';
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
  let mode = 'chat'; // 'chat' | 'categories' | 'category_items' | 'spell' | 'profile' | 'topics' | 'topic_items' | 'summary'
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

  const history = [
    { speaker: 'other', text: 'Did you sleep well?' }
  ];

  let replies = getOfflineReplies('Did you sleep well?', patientLang);

  const spellEngine = new SpellEngine({
    onBufferChange: () => render(),
    onPredictionsChange: () => render()
  });

  // Listen for fatigue events from Team A's gaze engine
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
      if (isFinal) {
        history.push({ speaker: 'other', text });
        handleNewUtterance(text);
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
    // 1. Instant feel: immediately display offline contextual replies
    replies = getOfflineReplies(text, patientLang);
    isLoadingReplies = true;
    render();

    // 2. Fetch AI replies (Groq -> Gemini fallback) and swap in
    try {
      const aiReplies = await predictReplies({
        utterance: text,
        history,
        profile: memory,
        language: patientLang
      });
      if (Array.isArray(aiReplies) && aiReplies.length > 0) {
        replies = aiReplies;
      }
    } catch (err) {
      console.warn('AI prediction failed, keeping instant replies:', err);
    } finally {
      isLoadingReplies = false;
      render();
    }
  }

  async function handleSelectPhrase(phraseText, kind = 'conversation', category = 'general') {
    if (!phraseText) return;

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

    // 2. Text-to-speech output
    speakPhrase(textToSpeak, listenerLang);

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
    }
    // Update replies contextually for patient's spoken turn
    replies = getOfflineReplies(phraseText, patientLang);
    render();
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
    replies = getOfflineReplies(heardText || '', patientLang);
    render();
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

  // Event delegation for both gaze-select and mouse click
  function onSelect(e) {
    const target = e.target.closest('[data-gaze-target]');
    if (!target) return;

    const action = target.dataset.action;
    const value = target.dataset.value;

    if (action === 'emergency') {
      triggerEmergency();
    } else if (action === 'dismiss-emergency') {
      dismissEmergency();
    } else if (action === 'fatigue-rest') {
      fatigueAlert = null;
      handleSelectPhrase("I am feeling tired. I'd like to rest my eyes.", 'fatigue', 'health');
    } else if (action === 'reply') {
      handleSelectPhrase(value || target.querySelector('.conv-tile-text')?.textContent || target.textContent);
    } else if (action === 'nav-topics') {
      mode = 'topics';
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
      render();
    } else if (action === 'nav-spell') {
      mode = 'spell';
      spellEngine.clear();
      render();
    } else if (action === 'nav-back') {
      if (mode === 'category_items') {
        mode = 'categories';
      } else if (mode === 'topic_items') {
        mode = 'topics';
      } else {
        mode = 'chat';
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
    } else if (action === 'toggle-input') {
      showManualInput = !showManualInput;
      render();
    } else if (action === 'open-profile') {
      mode = 'profile';
      render();
    } else if (action === 'close-profile') {
      mode = 'chat';
      render();
    } else if (action === 'open-summary') {
      openSummaryView();
    } else if (action === 'close-summary') {
      mode = 'chat';
      render();
    }
  }

  app.addEventListener('gaze-select', onSelect);
  app.addEventListener('click', onSelect);

  function render() {
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

    // 2. Doctor/Family Daily Summary Modal
    if (mode === 'summary') {
      app.innerHTML = `
        <div class="conv-modal-overlay">
          <div class="conv-modal-card conv-summary-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <h2 style="margin:0; color:var(--conv-accent);">📊 Daily Medical & Care Summary</h2>
              <button class="conv-btn-pill" data-action="close-summary">✕ Close</button>
            </div>
            ${
              isLoadingSummary
                ? '<div style="padding:40px; text-align:center; font-size:1.3rem; color:var(--conv-accent);">Generating clinical report with AI...</div>'
                : `<div class="conv-summary-text" id="summary-content">${escapeHtml(summaryReport)}</div>`
            }
            <div class="conv-modal-actions">
              <button class="conv-btn-pill" id="btn-copy-summary">📋 Copy Report</button>
              <button class="conv-btn-pill" id="btn-print-summary">🖨️ Print / Save PDF</button>
              <button class="conv-btn-pill active" data-action="close-summary">Done</button>
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

    // 3. Caregiver Memory & Profile Settings Modal (Keyboard-friendly)
    if (mode === 'profile') {
      app.innerHTML = `
        <div class="conv-modal-overlay">
          <div class="conv-modal-card">
            <h2 style="margin-top:0; color:var(--conv-accent);">Caregiver: Patient Profile & Memory</h2>
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
              <button class="conv-btn-pill" id="btn-save-profile">Save Changes</button>
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

    // 4. Top Bar (Heard Strip, Translation Subtitle, Caregiver Tools)
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

        <div class="conv-controls">
          <button class="conv-btn-pill ${isListening ? 'active' : ''}" data-action="toggle-mic">
            🎤 ${isListening ? 'Mic On' : 'Mic Off'}
          </button>
          <button class="conv-btn-pill" data-action="toggle-input" title="Manual Text Box Fallback">
            ⌨️ Text
          </button>
          <button class="conv-btn-pill" data-action="open-summary" title="Daily Summary">
            📊 Summary
          </button>
          <button class="conv-btn-pill" data-action="open-profile" title="Patient Profile & Meds">
            ⚙️ ${escapeHtml(memory.name.split(' ')[0])}
          </button>
        </div>
      </header>

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

    // 5. Side Navigation Rail (All large gaze targets >= 200x150px with >=40px gap)
    const navRailHtml = mode === 'spell' ? `
      <nav class="conv-nav-rail">
        <button class="conv-tile conv-tile-nav" data-gaze-target data-action="spell-speak" style="border-color:var(--conv-accent); background:rgba(0,229,255,0.15);">
          <span class="conv-tile-tag">Action</span>
          <span class="conv-tile-text">🔊 Speak</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>

        <button class="conv-tile conv-tile-nav" data-gaze-target data-action="spell-whatsapp" style="border-color:#25d366; background:rgba(37,211,102,0.12);">
          <span class="conv-tile-tag">WhatsApp</span>
          <span class="conv-tile-text">📲 Send MSG</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>

        <button class="conv-tile conv-tile-nav" data-gaze-target data-action="spell-space">
          <span class="conv-tile-tag">Letter</span>
          <span class="conv-tile-text">␣ Space</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>

        <button class="conv-tile conv-tile-nav" data-gaze-target data-action="spell-backspace">
          <span class="conv-tile-tag">Edit</span>
          <span class="conv-tile-text">⌫ Backspace</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>

        <button class="conv-tile conv-tile-nav" data-gaze-target data-action="spell-clear">
          <span class="conv-tile-tag">Edit</span>
          <span class="conv-tile-text">✕ Clear</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>

        <button class="conv-tile conv-tile-nav conv-tile-back" data-gaze-target data-action="nav-back">
          <span class="conv-tile-tag">Return</span>
          <span class="conv-tile-text">💬 Back</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>

        <button class="conv-tile conv-tile-emergency" data-gaze-target data-gaze-dwell="2000" data-action="emergency">
          <span class="conv-tile-tag">Hold 2s</span>
          <span class="conv-tile-text">🚨 EMERGENCY</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>
      </nav>
    ` : `
      <nav class="conv-nav-rail">
        <button class="conv-tile conv-tile-nav conv-tile-back" data-gaze-target data-action="nav-back">
          <span class="conv-tile-tag">Navigation</span>
          <span class="conv-tile-text">⬅️ ${mode === 'chat' ? 'Reset' : 'Back'}</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>

        <button class="conv-tile conv-tile-nav ${mode === 'topics' ? 'is-active' : ''}" data-gaze-target data-action="nav-topics" style="border-color:#ab47bc; background:rgba(171,71,188,0.12);">
          <span class="conv-tile-tag">Initiate</span>
          <span class="conv-tile-text">💬 I want to say</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>

        <button class="conv-tile conv-tile-nav ${mode === 'categories' ? 'is-active' : ''}" data-gaze-target data-action="nav-categories">
          <span class="conv-tile-tag">AAC Library</span>
          <span class="conv-tile-text">📂 ${isHi ? 'श्रेणियाँ' : 'Categories'}</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>

        <button class="conv-tile conv-tile-nav ${mode === 'spell' ? 'is-active' : ''}" data-gaze-target data-action="nav-spell">
          <span class="conv-tile-tag">Keyboard</span>
          <span class="conv-tile-text">🔤 ${isHi ? 'लिखें' : 'Spell'}</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>

        <button class="conv-tile conv-tile-nav" data-gaze-target data-action="toggle-listener-lang">
          <span class="conv-tile-tag">Listener Voice</span>
          <span class="conv-tile-text">🌐 ${escapeHtml(listenerObj.label)}</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>

        ${
          fatigueAlert
            ? `
          <button class="conv-tile conv-tile-fatigue" data-gaze-target data-action="fatigue-rest">
            <span class="conv-tile-tag">Tired?</span>
            <span class="conv-tile-text">😴 Take a break</span>
            <div class="conv-tile-dwell-ring"></div>
          </button>
        `
            : ''
        }

        <button class="conv-tile conv-tile-emergency" data-gaze-target data-gaze-dwell="2000" data-action="emergency">
          <span class="conv-tile-tag">Hold 2s</span>
          <span class="conv-tile-text">🚨 EMERGENCY</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>
      </nav>
    `;

    // 6. Main Interactive Grid depending on Mode
    let mainContentHtml = '';

    if (mode === 'chat') {
      // 2x3 Grid of Big Dynamic Reply Tiles
      mainContentHtml = `
        <div class="conv-grid-container">
          ${replies
            .slice(0, 6)
            .map(
              (r) => `
            <button class="conv-tile" data-gaze-target data-action="reply" data-value="${escapeHtml(r.text)}">
              <span class="conv-tile-tag">${escapeHtml(r.tag || r.type || 'Reply')}</span>
              <span class="conv-tile-text">${escapeHtml(r.text)}</span>
              <div class="conv-tile-dwell-ring"></div>
            </button>
          `
            )
            .join('')}
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
    } else if (mode === 'spell') {
      // Spell Mode Keyboard
      const activeGrp = spellEngine.activeGroup;
      const predictions = spellEngine.predictions || [];

      mainContentHtml = `
        <div class="conv-spell-container">
          <div class="conv-spell-bar">
            <div class="conv-spell-buffer">
              ${escapeHtml(spellEngine.buffer)}<span class="conv-spell-cursor"></span>
            </div>
            <div class="conv-spell-actions">
              <button class="conv-btn-pill" data-action="spell-space">␣ Space</button>
              <button class="conv-btn-pill" data-action="spell-backspace">⌫ Backspace</button>
              <button class="conv-btn-pill" data-action="spell-clear">✕ Clear</button>
              <button class="conv-btn-pill active" data-action="spell-speak" style="background:#00e5ff; color:#0b0e14; font-weight:700;">
                🔊 Speak
              </button>
            </div>
          </div>

          ${
            predictions.length > 0
              ? `
            <div class="conv-predictions-row">
              ${predictions
                .map(
                  (word) => `
                <button class="conv-tile conv-prediction-tile" data-gaze-target data-action="spell-prediction" data-value="${escapeHtml(word)}">
                  <span class="conv-tile-text">✨ ${escapeHtml(word)}</span>
                  <div class="conv-tile-dwell-ring"></div>
                </button>
              `
                )
                .join('')}
            </div>
          `
              : ''
          }

          <div class="conv-grid-container">
            ${
              activeGrp
                ? activeGrp.letters
                    .map(
                      (char) => `
                  <button class="conv-tile" data-gaze-target data-action="spell-letter" data-value="${char}">
                    <span class="conv-tile-text" style="font-size:2.8rem;">${char}</span>
                    <div class="conv-tile-dwell-ring"></div>
                  </button>
                `
                    )
                    .concat(`
                  <button class="conv-tile" data-gaze-target data-action="spell-group" data-value="">
                    <span class="conv-tile-text">⬅️ Groups</span>
                    <div class="conv-tile-dwell-ring"></div>
                  </button>
                `)
                    .join('')
                : LETTER_GROUPS.map(
                    (grp) => `
                  <button class="conv-tile" data-gaze-target data-action="spell-group" data-value="${grp.id}">
                    <span class="conv-tile-text" style="font-size:2rem; letter-spacing:0.15em;">${grp.label}</span>
                    <div class="conv-tile-dwell-ring"></div>
                  </button>
                `
                  ).join('')
            }
          </div>
        </div>
      `;
    }

    app.innerHTML = `
      ${topBarHtml}
      <div class="conv-main-view">
        ${navRailHtml}
        ${mainContentHtml}
      </div>
    `;

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
