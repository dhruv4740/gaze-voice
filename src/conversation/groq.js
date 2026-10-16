// Groq API integration for contextual AAC reply prediction

import { getOfflineReplies, getOfflineRoleReplies } from './categories.js';
import { getCompactMemoryPrompt, rankRepliesByMemory } from './memory.js';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

const TONE_INSTRUCTIONS = {
  gentle: 'Gentle, warm, and affectionate tone (kind, comforting, polite).',
  urgent: 'Urgent, direct, and concise tone (pressing, critical, immediate).',
  joking: 'Witty, lighthearted, and playful/joking tone with subtle humor.',
  formal: 'Polite, dignified, and formal tone.'
};

export async function predictReplies({ utterance, history = [], profile, language = 'en-IN', tone = 'gentle' }) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  const model = import.meta.env.VITE_GROQ_MODEL || 'openai/gpt-oss-20b';

  if (!apiKey || apiKey.trim() === '') {
    console.warn('VITE_GROQ_API_KEY not configured. Using offline AAC reply fallback.');
    return getOfflineRoleReplies(utterance, language);
  }

  const timeOfDay = getTimeOfDay();
  const isHi = language.startsWith('hi');
  const memorySnippet = getCompactMemoryPrompt();
  const toneDesc = TONE_INSTRUCTIONS[tone?.toLowerCase()] || TONE_INSTRUCTIONS.gentle;

  const systemPrompt = `You are an AI assistant for a non-verbal patient using an eye-gaze communication device.
${memorySnippet}
Time of day: ${timeOfDay}
Target Language: ${isHi ? 'Hindi (Devanagari script)' : 'Indian English'}
Patient Tone Style: ${toneDesc}

Rules:
1. Based on what was just heard, conversation history, and profile, output exactly 1 concise reply for each of these 5 semantic roles, phrased in the patient's Tone Style:
   - "agree": Affirmation, acceptance, or positive response
   - "decline": Polite refusal, declining, or negative response
   - "need": Practical, physical, or medical care need related to the question
   - "feeling": Physical comfort/sensation or emotional state
   - "ask_back": Reciprocal question or counter-question back to the speaker
2. Every reply MUST be strictly 8 words or fewer (<= 8 words).
3. Output JSON strictly adhering to this format with these exact keys:
{
  "agree": "...",
  "decline": "...",
  "need": "...",
  "feeling": "...",
  "ask_back": "...",
  "other": "..."
}`;

  // Format last ~6 turns
  const recentHistory = history.slice(-6).map((turn) => ({
    role: turn.speaker === 'patient' ? 'assistant' : 'user',
    content: turn.text
  }));

  const messages = [
    { role: 'system', content: systemPrompt },
    ...recentHistory,
    { role: 'user', content: `Current heard speech: "${utterance || 'Hello, how are you?'}"` }
  ];

  const fallback = getOfflineRoleReplies(utterance, language);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 s Groq timeout

    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.6,
        reasoning_effort: 'low',
        max_completion_tokens: 300,
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`Groq API responded with status ${res.status}. Falling back to Gemini.`);
      return await predictRepliesWithGemini({ utterance, history, profile, language, tone });
    }

    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');

    return formatRoleReplies(parsed, fallback, language);
  } catch (err) {
    console.warn('Groq prediction failed or exceeded 4s, falling back to Gemini:', err);
    return await predictRepliesWithGemini({ utterance, history, profile, language, tone });
  }
}

async function predictRepliesWithGemini({ utterance, history = [], profile, language = 'en-IN', tone = 'gentle' }) {
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const geminiModel = import.meta.env.VITE_GEMINI_MODEL || 'gemini-flash-lite-latest';
  const fallback = getOfflineRoleReplies(utterance, language);

  if (!geminiKey || geminiKey.trim() === '') {
    return fallback;
  }

  const isHi = language.startsWith('hi');
  const timeOfDay = getTimeOfDay();
  const toneDesc = TONE_INSTRUCTIONS[tone?.toLowerCase()] || TONE_INSTRUCTIONS.gentle;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;

  const prompt = `You are an AI assistant for a non-verbal patient using an eye-gaze communication device.
Patient: ${profile?.name || 'Aarav'} (${profile?.condition || 'Speech impaired'})
Key People: ${profile?.familyNames || 'Family and Doctor'}
Usual Needs: ${profile?.usualNeeds || 'Water, reposition, medicine'}
Time of day: ${timeOfDay}
Target Language: ${isHi ? 'Hindi (Devanagari script)' : 'Indian English'}
Patient Tone Style: ${toneDesc}
Current heard speech: "${utterance || 'Hello, how are you?'}"
Recent conversation context: ${history.slice(-4).map((t) => `${t.speaker}: ${t.text}`).join('; ')}

Output a JSON object with strictly 1 concise reply (8 words or fewer) for each of these keys:
- "agree": Affirmation or agreement
- "decline": Polite refusal or negation
- "need": Practical or physical care need
- "feeling": Emotional state or physical sensation
- "ask_back": Counter-question back to the speaker
- "other": Brief secondary option
${isHi ? 'CRITICAL: Reply texts must be in Hindi Devanagari script.' : ''}

JSON format:
{
  "agree": "...",
  "decline": "...",
  "need": "...",
  "feeling": "...",
  "ask_back": "...",
  "other": "..."
}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': geminiKey.trim()
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.6,
          maxOutputTokens: 300
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`Gemini fallback responded with ${res.status}. Using offline replies.`);
      return fallback;
    }

    const data = await res.json();
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    rawText = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(rawText);

    return formatRoleReplies(parsed, fallback, language);
  } catch (err) {
    console.warn('Gemini fallback failed:', err);
  }

  return fallback;
}

function formatRoleReplies(rawParsed, fallback, language) {
  const isHi = (language || '').startsWith('hi');
  const clean = (val, maxWords = 8) => {
    if (!val || typeof val !== 'string') return '';
    const words = val.trim().split(/\s+/);
    return words.slice(0, maxWords).join(' ');
  };

  const getVal = (key) => {
    if (rawParsed && rawParsed[key]) return clean(rawParsed[key]);
    if (rawParsed && Array.isArray(rawParsed.replies)) {
      const idx = ['agree', 'decline', 'need', 'feeling', 'ask_back'].indexOf(key);
      if (idx !== -1 && rawParsed.replies[idx]?.text) {
        return clean(rawParsed.replies[idx].text);
      }
    }
    return fallback[key]?.text || '';
  };

  return {
    agree: {
      role: 'agree',
      tag: isHi ? 'सहमति' : 'Agree',
      text: getVal('agree') || (isHi ? 'हाँ, बिल्कुल' : 'Yes, definitely.')
    },
    decline: {
      role: 'decline',
      tag: isHi ? 'अस्वीकार' : 'Decline',
      text: getVal('decline') || (isHi ? 'नहीं, धन्यवाद' : 'No, thank you.')
    },
    need: {
      role: 'need',
      tag: isHi ? 'ज़रूरत' : 'Need',
      text: getVal('need') || (isHi ? 'कृपया मदद कीजिए' : 'Please help me.')
    },
    feeling: {
      role: 'feeling',
      tag: isHi ? 'महसूस' : 'Feeling',
      text: getVal('feeling') || (isHi ? 'मैं ठीक महसूस कर रहा हूँ' : 'I feel comfortable.')
    },
    ask_back: {
      role: 'ask_back',
      tag: isHi ? 'प्रश्न' : 'Ask Back',
      text: getVal('ask_back') || (isHi ? 'आप कैसे हैं?' : 'How are you doing?')
    },
    other: {
      role: 'other',
      tag: isHi ? 'अन्य' : 'Other',
      text: getVal('other') || (isHi ? 'बहुत धन्यवाद' : 'Thank you so much.')
    }
  };
}

export async function predictWordCompletions(prefix, context = '') {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  const model = import.meta.env.VITE_GROQ_MODEL || 'openai/gpt-oss-20b';

  if (!apiKey || !prefix || prefix.length < 2) {
    return getLocalWordCompletions(prefix);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const prompt = `Return a JSON object with a "words" array containing the 4 most likely next words starting with "${prefix}" in medical/assistive AAC context. JSON format: {"words": ["word1", "word2", "word3", "word4"]}`;
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        reasoning_effort: 'low',
        max_completion_tokens: 300,
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) return getLocalWordCompletions(prefix);
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    if (Array.isArray(parsed.words) && parsed.words.length > 0) {
      return parsed.words.slice(0, 4).map((w) => w.toUpperCase());
    }
  } catch (e) {
    // ignore
  }

  return getLocalWordCompletions(prefix);
}

const COMMON_WORDS = [
  'WATER', 'WASHROOM', 'WAIT', 'WARM', 'WANT', 'WALK',
  'PILLOW', 'PAIN', 'PLEASE', 'PHONE', 'POSITION', 'PULSE',
  'DOCTOR', 'DRINK', 'DOOR', 'DUE', 'DIZZY',
  'TIRED', 'THANK', 'THIRSTY', 'TABLE', 'TEMPERATURE',
  'BLANKET', 'BATHROOM', 'BACK', 'BREATHE', 'BETTER',
  'SUCTION', 'SLEEP', 'STOMACH', 'SHADOW', 'SMILE',
  'COLD', 'CLEAN', 'CALL', 'COMFORT', 'CHEST',
  'MEDICINE', 'MORNING', 'MOUTH', 'MOVE', 'MORE',
  'NURSE', 'NECK', 'NIGHT', 'NO', 'NOW',
  'HELP', 'HEAD', 'HOT', 'HUNGRY', 'HOLD',
  'FAMILY', 'FEEL', 'FAN', 'FOOD', 'FEET'
];

function getLocalWordCompletions(prefix) {
  const p = (prefix || '').toUpperCase();
  const matches = COMMON_WORDS.filter((w) => w.startsWith(p)).slice(0, 4);
  return matches;
}
