// Patient memory & interaction logger stored in localStorage

const STORAGE_MEMORY_KEY = 'gaze_voice_patient_memory';
const STORAGE_LOG_KEY = 'gaze_voice_interaction_log';
const STORAGE_FREQ_KEY = 'gaze_voice_reply_frequency';

const STORAGE_PAIN_KEY = 'gaze_voice_pain_logs';

const DEFAULT_MEMORY = {
  name: 'Aarav Sharma',
  condition: 'ALS / Locked-in speech impairment, uses eye-gaze',
  familyNames: 'Priya (wife), Rohan (son), Dr. Mehta (neurologist), Riya (nurse)',
  likes: 'Cricket, Chai with ginger, Ghazals, Sunlit window',
  meds: 'Riluzole 50mg at 9:00 AM & 9:00 PM; Pain drops at 2:00 PM; Multivitamin with lunch',
  usualNeeds: 'Water with straw, pillow adjust, suction, fan on, light blanket',
  notes: 'Understands English, Hindi, and Marathi.',
  selectedTone: 'gentle', // 'gentle' | 'urgent' | 'joking' | 'formal'
  pinnedReplies: {
    // e.g. 'agree': { text: 'Yes, absolutely', tag: 'Agree' }
  }
};

export function getMemory() {
  try {
    const raw = localStorage.getItem(STORAGE_MEMORY_KEY);
    if (!raw) return { ...DEFAULT_MEMORY, pinnedReplies: { ...DEFAULT_MEMORY.pinnedReplies } };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_MEMORY,
      ...parsed,
      selectedTone: parsed.selectedTone || 'gentle',
      pinnedReplies: parsed.pinnedReplies || {}
    };
  } catch (err) {
    console.warn('Failed to load memory:', err);
    return { ...DEFAULT_MEMORY, pinnedReplies: {} };
  }
}

export function saveMemory(memory) {
  try {
    localStorage.setItem(STORAGE_MEMORY_KEY, JSON.stringify(memory));
  } catch (err) {
    console.warn('Failed to save memory:', err);
  }
}

export function getPinnedReplies() {
  return getMemory().pinnedReplies || {};
}

export function savePinnedReply(role, text, tag = 'Pinned') {
  const mem = getMemory();
  if (!mem.pinnedReplies) mem.pinnedReplies = {};
  mem.pinnedReplies[role] = { text, tag };
  saveMemory(mem);
  return mem.pinnedReplies;
}

export function removePinnedReply(role) {
  const mem = getMemory();
  if (mem.pinnedReplies && mem.pinnedReplies[role]) {
    delete mem.pinnedReplies[role];
    saveMemory(mem);
  }
  return mem.pinnedReplies || {};
}

export function togglePinnedReply(role, text, tag = 'Pinned') {
  const pinned = getPinnedReplies();
  if (pinned[role]) {
    return removePinnedReply(role);
  } else {
    return savePinnedReply(role, text, tag);
  }
}

export function getSelectedTone() {
  return getMemory().selectedTone || 'gentle';
}

export function setSelectedTone(tone) {
  const mem = getMemory();
  mem.selectedTone = tone || 'gentle';
  saveMemory(mem);
  return mem.selectedTone;
}

export function logInteraction({ heard = '', reply = '', kind = 'conversation', category = 'general', zone = null, level = null, score = null }) {
  try {
    const now = new Date();
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: now.getTime(),
      timeStr: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      dateStr: now.toISOString().split('T')[0],
      heard,
      reply,
      kind, // 'conversation' | 'request' | 'spell' | 'emergency' | 'topic' | 'pain'
      category,
      zone,
      level,
      score
    };

    const existingLog = getDailyLog();
    existingLog.push(entry);
    localStorage.setItem(STORAGE_LOG_KEY, JSON.stringify(existingLog.slice(-100))); // keep last 100 entries

    // Update frequency
    if (reply) {
      const freq = getFrequencyMap();
      freq[reply] = (freq[reply] || 0) + 1;
      localStorage.setItem(STORAGE_FREQ_KEY, JSON.stringify(freq));
    }

    return entry;
  } catch (err) {
    console.warn('Failed to log interaction:', err);
  }
}

export function logPainRecord({ zone, level, score, note = '' }) {
  try {
    const phrase = `My ${zone} hurts, ${level}, ${score} out of 10`;
    const entry = logInteraction({
      heard: '',
      reply: phrase,
      kind: 'pain',
      category: 'pain',
      zone,
      level,
      score
    });

    const now = new Date();
    const painItem = {
      id: entry?.id || `${Date.now()}`,
      zone,
      level,
      score,
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: now.getTime(),
      note
    };

    const existing = getPainLogs();
    existing.push(painItem);
    localStorage.setItem(STORAGE_PAIN_KEY, JSON.stringify(existing.slice(-50)));

    return painItem;
  } catch (err) {
    console.warn('Failed to log pain:', err);
  }
}

export function getPainLogs() {
  try {
    const raw = localStorage.getItem(STORAGE_PAIN_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function getDailyLog() {
  try {
    const raw = localStorage.getItem(STORAGE_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

export function clearDailyLog() {
  localStorage.removeItem(STORAGE_LOG_KEY);
}

export function getFrequencyMap() {
  try {
    const raw = localStorage.getItem(STORAGE_FREQ_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}

export function getCompactMemoryPrompt() {
  const mem = getMemory();
  return `Patient Memory:
- Name: ${mem.name}
- Family & Carers: ${mem.familyNames}
- Likes/Interests: ${mem.likes}
- Daily Meds & Times: ${mem.meds}
- Common Needs: ${mem.usualNeeds}
Personalize replies with known family names, medication timings (e.g. "Time for my 2 pm tablet"), or preferences when contextually fitting.`;
}

export function rankRepliesByMemory(replies) {
  if (!Array.isArray(replies)) return replies;
  const freq = getFrequencyMap();

  // If patient has used phrases before, bias them higher while keeping variety
  return [...replies].sort((a, b) => {
    const countA = freq[a.text] || 0;
    const countB = freq[b.text] || 0;
    return countB - countA;
  });
}
