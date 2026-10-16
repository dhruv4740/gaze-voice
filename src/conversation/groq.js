// Groq API integration for contextual AAC reply prediction

import { getOfflineReplies } from './categories.js';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

export async function predictReplies({ utterance, history = [], profile, language = 'en-IN' }) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  const model = import.meta.env.VITE_GROQ_MODEL || 'llama-3.1-8b-instant';

  if (!apiKey || apiKey.trim() === '') {
    console.warn('VITE_GROQ_API_KEY not configured. Using offline AAC reply fallback.');
    return getOfflineReplies(utterance, language);
  }

  const timeOfDay = getTimeOfDay();
  const isHi = language.startsWith('hi');

  const systemPrompt = `You are an AI assistant for a non-verbal patient using an eye-gaze communication device.
Patient Profile:
- Name: ${profile?.name || 'Aarav'}
- Condition: ${profile?.condition || 'Speech impaired'}
- Key People: ${profile?.familyNames || 'Family and Doctor'}
- Usual Needs: ${profile?.usualNeeds || 'Water, reposition, medicine'}
- Time of day: ${timeOfDay}
- Target Language: ${isHi ? 'Hindi (Devanagari script)' : 'Indian English'}

Rules:
1. Based on what was just heard, conversation history, and profile, output exactly 6 reply options for the patient.
2. Every reply MUST be concise and strictly 8 words or fewer (<= 8 words).
3. The 6 replies MUST match these 6 categories in order:
   - "yes": Affirmation or agreement
   - "no": Polite refusal or negation
   - "need": Practical or physical care need
   - "feeling": Emotional state or physical sensation
   - "question": Counter-question back to the speaker
   - "surprise": A contextual, warm, or personal remark
4. Output JSON strictly adhering to this format:
{
  "replies": [
    { "type": "yes", "tag": "Yes", "text": "..." },
    { "type": "no", "tag": "No", "text": "..." },
    { "type": "need", "tag": "Need", "text": "..." },
    { "type": "feeling", "tag": "Feeling", "text": "..." },
    { "type": "question", "tag": "Question", "text": "..." },
    { "type": "surprise", "tag": "Note", "text": "..." }
  ]
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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

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
      console.warn(`Groq API responded with status ${res.status}. Falling back to offline replies.`);
      return getOfflineReplies(utterance, language);
    }

    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');

    if (Array.isArray(parsed.replies) && parsed.replies.length > 0) {
      // Validate and clean each reply to <= 8 words
      return parsed.replies.slice(0, 6).map((r, i) => {
        let text = (r.text || '').trim();
        const words = text.split(/\s+/);
        if (words.length > 8) text = words.slice(0, 8).join(' ');
        return {
          type: r.type || 'reply',
          tag: r.tag || (['Yes', 'No', 'Need', 'Feeling', 'Question', 'Note'][i] || 'Reply'),
          text
        };
      });
    }

    return getOfflineReplies(utterance, language);
  } catch (err) {
    console.warn('Groq prediction failed or timed out:', err);
    return getOfflineReplies(utterance, language);
  }
}

export async function predictWordCompletions(prefix, context = '') {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  const model = import.meta.env.VITE_GROQ_MODEL || 'llama-3.1-8b-instant';

  if (!apiKey || !prefix || prefix.length < 2) {
    return getLocalWordCompletions(prefix);
  }

  try {
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
        max_completion_tokens: 100,
        response_format: { type: 'json_object' }
      })
    });

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
