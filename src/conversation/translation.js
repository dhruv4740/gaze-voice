// Live multilingual translation (English / Hindi / Marathi)

export const LISTENER_LANGUAGES = [
  { code: 'en-IN', name: 'English', label: 'English' },
  { code: 'hi-IN', name: 'Hindi', label: 'हिन्दी' },
  { code: 'mr-IN', name: 'Marathi', label: 'मराठी' }
];

const COMMON_TRANSLATIONS = {
  'Yes, I slept well.': {
    'hi-IN': 'हाँ, मुझे अच्छी नींद आई।',
    'mr-IN': 'हो, मला छान झोप लागली.'
  },
  'No, not very well.': {
    'hi-IN': 'नहीं, ठीक से नहीं।',
    'mr-IN': 'नाही, नीट झोप नाही झाली.'
  },
  'Please adjust my pillow.': {
    'hi-IN': 'कृपया मेरा तकिया ठीक कीजिए।',
    'mr-IN': 'कृपया माझी उशी नीट करा.'
  },
  'Feeling a little tired.': {
    'hi-IN': 'थोड़ी थकान महसूस हो रही है।',
    'mr-IN': 'मला थोडा थकवा जाणवतोय.'
  },
  'Water with straw please.': {
    'hi-IN': 'कृपया स्ट्रॉ से पानी दीजिए।',
    'mr-IN': 'कृपया स्ट्रॉने पाणी द्या.'
  },
  'Turn on the lights': {
    'hi-IN': 'लाइट जला दीजिए।',
    'mr-IN': 'लाईट चालू करा.'
  },
  'Turn on the fan': {
    'hi-IN': 'पंखा चालू कर दीजिए।',
    'mr-IN': 'पंखा चालू करा.'
  },
  'Call Nurse immediately': {
    'hi-IN': 'नर्स को तुरंत बुलाइए।',
    'mr-IN': 'नर्सला लगेच बोलवा.'
  },
  'I am comfortable right now': {
    'hi-IN': 'मैं अभी ठीक महसूस कर रहा हूँ।',
    'mr-IN': 'मी आता अगदी व्यवस्थित आहे.'
  },
  'Headache is bothering me': {
    'hi-IN': 'सिर में दर्द हो रहा है।',
    'mr-IN': 'माझं डोकं दुखतंय.'
  },
  'I love you all': {
    'hi-IN': 'मुझे आप सब से प्यार है।',
    'mr-IN': 'माझं तुम्हा सर्वांवर प्रेम आहे.'
  }
};

export async function translateText({ text, targetLang = 'en-IN' }) {
  if (!text || targetLang.startsWith('en')) {
    return text;
  }

  // 1. Instant dictionary lookup
  const clean = text.trim();
  if (COMMON_TRANSLATIONS[clean] && COMMON_TRANSLATIONS[clean][targetLang]) {
    return COMMON_TRANSLATIONS[clean][targetLang];
  }

  // 2. Groq AI translation
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  const model = import.meta.env.VITE_GROQ_MODEL || 'openai/gpt-oss-20b';

  if (!apiKey) return text;

  const langName = targetLang.startsWith('mr') ? 'Marathi' : 'Hindi';

  try {
    const prompt = `Translate this sentence into natural spoken ${langName} in Devanagari script for an AAC patient. Return ONLY the translation, nothing else: "${text}"`;
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        reasoning_effort: 'low',
        max_completion_tokens: 100
      })
    });

    if (res.ok) {
      const data = await res.json();
      const translated = data.choices?.[0]?.message?.content?.trim();
      if (translated) return translated;
    }
  } catch (err) {
    console.warn('AI translation failed, keeping original text:', err);
  }

  return text;
}
