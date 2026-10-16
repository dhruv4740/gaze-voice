// Team B (teammate) owns everything in src/conversation/.
// Implements the complete AAC conversation interface: layout, speech recognition,
// Groq replies, speech synthesis, categories, patient profile, spell mode, emergency.

import './conversation.css';
import { getProfile, saveProfile } from './profile.js';
import { CATEGORIES, getOfflineReplies } from './categories.js';
import { predictReplies } from './groq.js';
import { SpeechListener, speakPhrase } from './speech.js';
import { SpellEngine, LETTER_GROUPS } from './spell.js';
import { startEmergencyAlarm, stopEmergencyAlarm } from './emergency.js';

export function startConversation(app) {
  let profile = getProfile();
  let language = 'en-IN'; // 'en-IN' | 'hi-IN'
  let mode = 'chat'; // 'chat' | 'categories' | 'category_items' | 'spell' | 'profile'
  let activeCategory = null;
  let isEmergency = false;
  let isListening = false;
  let isLoadingReplies = false;
  let heardText = '';
  let showManualInput = false;

  const history = [
    { speaker: 'other', text: 'Hello, how are you feeling today?' }
  ];

  let replies = getOfflineReplies('Hello, how are you feeling today?', language);

  const spellEngine = new SpellEngine({
    onBufferChange: () => render(),
    onPredictionsChange: () => render()
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
    isLoadingReplies = true;
    render();
    try {
      replies = await predictReplies({
        utterance: text,
        history,
        profile,
        language
      });
    } catch (err) {
      console.warn('Error predicting replies:', err);
      replies = getOfflineReplies(text, language);
    } finally {
      isLoadingReplies = false;
      render();
    }
  }

  function handleSelectPhrase(phraseText) {
    if (!phraseText) return;
    speakPhrase(phraseText, language);
    history.push({ speaker: 'patient', text: phraseText });

    // After speaking, prompt Groq for likely follow-ups or reset heard context
    if (mode !== 'chat') {
      mode = 'chat';
    }
    render();
  }

  function triggerEmergency() {
    isEmergency = true;
    startEmergencyAlarm();
    render();
  }

  function dismissEmergency() {
    isEmergency = false;
    stopEmergencyAlarm();
    render();
  }

  function toggleLanguage() {
    language = language === 'en-IN' ? 'hi-IN' : 'en-IN';
    listener.setLanguage(language);
    replies = getOfflineReplies(heardText || '', language);
    render();
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
    } else if (action === 'reply') {
      handleSelectPhrase(value || target.querySelector('.conv-tile-text')?.textContent || target.textContent);
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
        handleSelectPhrase(spellEngine.buffer.trim());
        spellEngine.clear();
        mode = 'chat';
        render();
      }
    } else if (action === 'toggle-lang') {
      toggleLanguage();
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
    }
  }

  app.addEventListener('gaze-select', onSelect);
  app.addEventListener('click', onSelect);

  function render() {
    const isHi = language.startsWith('hi');

    // 1. Emergency Fullscreen Modal
    if (isEmergency) {
      app.innerHTML = `
        <div class="conv-emergency-modal">
          <div class="conv-emergency-banner">
            <span>🚨</span> PATIENT NEEDS HELP <span>🚨</span>
          </div>
          <div class="conv-emergency-sub">
            <strong>${profile.name}</strong> • ${profile.condition}<br/>
            Usual needs: ${profile.usualNeeds}<br/>
            Emergency contacts: ${profile.familyNames}
          </div>
          <button class="conv-tile conv-emergency-dismiss" data-gaze-target data-gaze-dwell="1200" data-action="dismiss-emergency">
            <span class="conv-tile-text">DISMISS ALARM</span>
            <div class="conv-tile-dwell-ring"></div>
          </button>
        </div>
      `;
      return;
    }

    // 2. Profile Settings Modal
    if (mode === 'profile') {
      app.innerHTML = `
        <div class="conv-modal-overlay">
          <div class="conv-modal-card">
            <h2 style="margin-top:0; color:var(--conv-accent);">Patient Profile Settings</h2>
            <div class="conv-form-group">
              <label>Patient Name</label>
              <input type="text" id="prof-name" value="${escapeHtml(profile.name)}" />
            </div>
            <div class="conv-form-group">
              <label>Condition & Communication</label>
              <input type="text" id="prof-condition" value="${escapeHtml(profile.condition)}" />
            </div>
            <div class="conv-form-group">
              <label>Key People & Family</label>
              <input type="text" id="prof-family" value="${escapeHtml(profile.familyNames)}" />
            </div>
            <div class="conv-form-group">
              <label>Usual Needs</label>
              <input type="text" id="prof-needs" value="${escapeHtml(profile.usualNeeds)}" />
            </div>
            <div class="conv-form-group">
              <label>Personal Notes / Preferences</label>
              <textarea id="prof-notes" rows="2">${escapeHtml(profile.notes || '')}</textarea>
            </div>
            <div class="conv-modal-actions">
              <button class="conv-btn-pill" id="btn-save-profile">Save Profile</button>
              <button class="conv-btn-pill" data-gaze-target data-action="close-profile">Close</button>
            </div>
          </div>
        </div>
      `;
      const btnSave = app.querySelector('#btn-save-profile');
      if (btnSave) {
        btnSave.onclick = () => {
          profile = {
            name: app.querySelector('#prof-name').value,
            condition: app.querySelector('#prof-condition').value,
            familyNames: app.querySelector('#prof-family').value,
            usualNeeds: app.querySelector('#prof-needs').value,
            notes: app.querySelector('#prof-notes').value
          };
          saveProfile(profile);
          mode = 'chat';
          render();
        };
      }
      return;
    }

    // 3. Top Bar (Heard Strip, Language, Mic, Fallback Input)
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
          <button class="conv-btn-pill" data-action="toggle-lang">
            🌐 ${isHi ? 'हिन्दी (HI)' : 'English (EN)'}
          </button>
          <button class="conv-btn-pill" data-action="toggle-input" title="Manual Text Box Fallback">
            ⌨️ Text
          </button>
          <button class="conv-btn-pill" data-action="open-profile" title="Patient Profile">
            ⚙️ ${escapeHtml(profile.name.split(' ')[0])}
          </button>
        </div>
      </header>
      ${
        showManualInput
          ? `
        <div style="background:#131824; padding:8px 20px; display:flex; gap:10px; border-bottom:1px solid #263347;">
          <input type="text" id="manual-utterance" placeholder="Type what you said (fallback for noisy rooms)..." style="flex:1; background:#0b0e14; border:1px solid #263347; color:#fff; padding:8px 12px; border-radius:8px;" />
          <button class="conv-btn-pill active" id="btn-submit-manual">Ask</button>
        </div>
      `
          : ''
      }
    `;

    // 4. Side Navigation Rail (All large gaze targets >= 200x150px or substantial tiles)
    const navRailHtml = mode === 'spell' ? `
      <nav class="conv-nav-rail">
        <button class="conv-tile conv-tile-nav" data-gaze-target data-action="spell-speak" style="border-color:var(--conv-accent); background:rgba(0,229,255,0.15);">
          <span class="conv-tile-tag">Action</span>
          <span class="conv-tile-text">🔊 Speak</span>
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
          <span class="conv-tile-text">💬 Back to Chat</span>
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

        <button class="conv-tile conv-tile-nav" data-gaze-target data-action="toggle-lang">
          <span class="conv-tile-tag">Language</span>
          <span class="conv-tile-text">🌐 ${isHi ? 'हिन्दी (HI)' : 'English (EN)'}</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>

        <button class="conv-tile conv-tile-emergency" data-gaze-target data-gaze-dwell="2000" data-action="emergency">
          <span class="conv-tile-tag">Hold 2s</span>
          <span class="conv-tile-text">🚨 EMERGENCY</span>
          <div class="conv-tile-dwell-ring"></div>
        </button>
      </nav>
    `;

    // 5. Main Area depending on Mode
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
