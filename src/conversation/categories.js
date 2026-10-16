// Fixed categories & sub-tiles for AAC communication and offline fallback

export const CATEGORIES = [
  {
    id: 'needs',
    label: 'Needs',
    labelHi: 'ज़रूरतें',
    tag: 'Physical',
    icon: '💧',
    phrases: {
      'en-IN': [
        'Water with straw please',
        'Reposition my pillow',
        'Need to use bathroom',
        'Turn on the fan',
        'I need a blanket',
        'Suction now please'
      ],
      'hi-IN': [
        'कृपया पानी पिलाइए',
        'तकिया ठीक कर दीजिए',
        'बाथरूम जाना है',
        'पंखा चला दीजिए',
        'कंबल ओढ़ा दीजिए',
        'सक्शन कर दीजिए'
      ]
    }
  },
  {
    id: 'feelings',
    label: 'Feelings',
    labelHi: 'महसूस',
    tag: 'Emotion',
    icon: '❤️',
    phrases: {
      'en-IN': [
        'I am comfortable',
        'Feeling very tired',
        'A little too cold',
        'Happy to see you',
        'Give me a moment',
        'Feeling much better'
      ],
      'hi-IN': [
        'मैं ठीक हूँ',
        'थकान लग रही है',
        'ठंड लग रही है',
        'आपसे मिलकर खुशी हुई',
        'थोड़ा समय दीजिए',
        'अब बेहतर लग रहा है'
      ]
    }
  },
  {
    id: 'people',
    label: 'People',
    labelHi: 'लोग',
    tag: 'Contact',
    icon: '👥',
    phrases: {
      'en-IN': [
        'Call Priya please',
        'Call Rohan',
        'Call Dr. Mehta',
        'Where is the nurse?',
        'Who is here?',
        'Please stay with me'
      ],
      'hi-IN': [
        'प्रिया को बुलाइए',
        'रोहन को बुलाइए',
        'डॉक्टर मेहता को बुलाइए',
        'नर्स कहाँ हैं?',
        'यहाँ कौन है?',
        'कृपया मेरे साथ रहिए'
      ]
    }
  },
  {
    id: 'pain',
    label: 'Pain',
    labelHi: 'दर्द',
    tag: 'Health',
    icon: '🩺',
    phrases: {
      'en-IN': [
        'Severe headache',
        'My back hurts',
        'My throat is dry',
        'Legs are cramping',
        'Need pain medication',
        'Mild ache only'
      ],
      'hi-IN': [
        'सिर में बहुत दर्द है',
        'पीठ में दर्द है',
        'गला सूख रहा है',
        'पैरों में ऐंठन है',
        'दर्द की दवा चाहिए',
        'हल्का दर्द है'
      ]
    }
  },
  {
    id: 'quick',
    label: 'Quick Replies',
    labelHi: 'त्वरित',
    tag: 'Common',
    icon: '⚡',
    phrases: {
      'en-IN': [
        'Yes, definitely',
        'No, thank you',
        'Thank you so much',
        'Wait a moment',
        'I love you',
        'Never mind'
      ],
      'hi-IN': [
        'हाँ, बिल्कुल',
        'नहीं, धन्यवाद',
        'बहुत बहुत धन्यवाद',
        'ज़रा रुकिए',
        'मुझे तुमसे प्यार है',
        'कोई बात नहीं'
      ]
    }
  }
];

export function getOfflineReplies(utterance = '', lang = 'en-IN') {
  const isHi = lang.startsWith('hi');
  const lower = utterance.toLowerCase();

  // If question about sleep/feeling
  if (lower.includes('sleep') || lower.includes('soye') || lower.includes('feeling') || lower.includes('kaise')) {
    return [
      { type: 'yes', tag: 'Yes', text: isHi ? 'हाँ, अच्छी नींद आई' : 'Yes, I slept well.' },
      { type: 'no', tag: 'No', text: isHi ? 'नहीं, ठीक से नहीं' : 'No, not very well.' },
      { type: 'need', tag: 'Need', text: isHi ? 'कृपया तकिया ठीक कीजिए' : 'Please adjust my pillow.' },
      { type: 'feeling', tag: 'Feeling', text: isHi ? 'थोड़ी थकान है' : 'Feeling a little tired.' },
      { type: 'question', tag: 'Question', text: isHi ? 'आप कैसे हैं?' : 'How are you doing?' },
      { type: 'surprise', tag: 'Note', text: isHi ? 'आज मौसम कैसा है?' : 'What is the weather today?' }
    ];
  }

  // If question about food/water/pain
  if (lower.includes('water') || lower.includes('pani') || lower.includes('pain') || lower.includes('dard')) {
    return [
      { type: 'yes', tag: 'Yes', text: isHi ? 'हाँ, ज़रूर' : 'Yes, please.' },
      { type: 'no', tag: 'No', text: isHi ? 'नहीं, अभी नहीं' : 'No, not right now.' },
      { type: 'need', tag: 'Need', text: isHi ? 'पानी स्ट्रॉ से दीजिए' : 'Water with straw please.' },
      { type: 'feeling', tag: 'Feeling', text: isHi ? 'गले में सूखापन है' : 'My throat is dry.' },
      { type: 'question', tag: 'Question', text: isHi ? 'दवा का समय हुआ?' : 'Is it medicine time?' },
      { type: 'surprise', tag: 'Note', text: isHi ? 'बस पंखा चला दीजिए' : 'Just turn on the fan.' }
    ];
  }

  // Default balanced 6-reply AAC set
  return [
    { type: 'yes', tag: 'Yes', text: isHi ? 'हाँ, बिल्कुल' : 'Yes, please.' },
    { type: 'no', tag: 'No', text: isHi ? 'नहीं, अभी नहीं' : 'No, not now.' },
    { type: 'need', tag: 'Need', text: isHi ? 'मुझे पानी चाहिए' : 'I need some water.' },
    { type: 'feeling', tag: 'Feeling', text: isHi ? 'मैं ठीक महसूस कर रहा हूँ' : 'I feel comfortable.' },
    { type: 'question', tag: 'Question', text: isHi ? 'क्या समय हुआ है?' : 'What time is it?' },
    { type: 'surprise', tag: 'Note', text: isHi ? 'आपसे बात करके अच्छा लगा' : 'Good to talk to you.' }
  ];
}
