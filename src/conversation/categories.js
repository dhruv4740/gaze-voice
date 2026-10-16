// Fixed categories & sub-tiles for AAC communication and offline fallback

export const CATEGORIES = [
  {
    id: 'needs',
    label: 'Needs',
    labelHi: 'ज़रूरतें',
    tag: 'Physical',
    icon: '',
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
    icon: '',
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
    icon: '',
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
    icon: '',
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
    icon: '',
    phrases: {
      'en-IN': [
        'Yes, definitely',
        'No, thank you',
        'Thank you so much',
        'Wait a moment',
        'I appreciate it',
        'Never mind'
      ],
      'hi-IN': [
        'हाँ, बिल्कुल',
        'नहीं, धन्यवाद',
        'बहुत बहुत धन्यवाद',
        'ज़रा रुकिए',
        'धन्यवाद',
        'कोई बात नहीं'
      ]
    }
  }
];

export function getOfflineRoleReplies(utterance = '', lang = 'en-IN') {
  const isHi = lang.startsWith('hi');
  const lower = utterance.toLowerCase();

  if (lower.includes('sleep') || lower.includes('soye') || lower.includes('feeling') || lower.includes('kaise')) {
    return {
      agree: { role: 'agree', tag: isHi ? 'सहमति' : 'Agree', text: isHi ? 'हाँ, अच्छी नींद आई' : 'Yes, I slept well.' },
      decline: { role: 'decline', tag: isHi ? 'अस्वीकार' : 'Decline', text: isHi ? 'नहीं, ठीक से नहीं' : 'No, not very well.' },
      need: { role: 'need', tag: isHi ? 'ज़रूरत' : 'Need', text: isHi ? 'कृपया तकिया ठीक कीजिए' : 'Please adjust my pillow.' },
      feeling: { role: 'feeling', tag: isHi ? 'महसूस' : 'Feeling', text: isHi ? 'थोड़ी थकान है' : 'Feeling a little tired.' },
      ask_back: { role: 'ask_back', tag: isHi ? 'प्रश्न' : 'Ask Back', text: isHi ? 'आप कैसे हैं?' : 'How are you doing?' },
      other: { role: 'other', tag: isHi ? 'अन्य' : 'Other', text: isHi ? 'बहुत धन्यवाद' : 'Thank you so much.' }
    };
  }

  if (lower.includes('water') || lower.includes('pani') || lower.includes('pain') || lower.includes('dard')) {
    return {
      agree: { role: 'agree', tag: isHi ? 'सहमति' : 'Agree', text: isHi ? 'हाँ, ज़रूर' : 'Yes, please.' },
      decline: { role: 'decline', tag: isHi ? 'अस्वीकार' : 'Decline', text: isHi ? 'नहीं, अभी नहीं' : 'No, not right now.' },
      need: { role: 'need', tag: isHi ? 'ज़रूरत' : 'Need', text: isHi ? 'पानी स्ट्रॉ से दीजिए' : 'Water with straw please.' },
      feeling: { role: 'feeling', tag: isHi ? 'महसूस' : 'Feeling', text: isHi ? 'गले में सूखापन है' : 'My throat is dry.' },
      ask_back: { role: 'ask_back', tag: isHi ? 'प्रश्न' : 'Ask Back', text: isHi ? 'दवा का समय हुआ?' : 'Is it medicine time?' },
      other: { role: 'other', tag: isHi ? 'अन्य' : 'Other', text: isHi ? 'थोड़ा समय दीजिए' : 'I need a moment.' }
    };
  }

  return {
    agree: { role: 'agree', tag: isHi ? 'सहमति' : 'Agree', text: isHi ? 'हाँ, बिल्कुल' : 'Yes, definitely.' },
    decline: { role: 'decline', tag: isHi ? 'अस्वीकार' : 'Decline', text: isHi ? 'नहीं, धन्यवाद' : 'No, thank you.' },
    need: { role: 'need', tag: isHi ? 'ज़रूरत' : 'Need', text: isHi ? 'मुझे पानी चाहिए' : 'I need some water.' },
    feeling: { role: 'feeling', tag: isHi ? 'महसूस' : 'Feeling', text: isHi ? 'मैं ठीक महसूस कर रहा हूँ' : 'I feel comfortable.' },
    ask_back: { role: 'ask_back', tag: isHi ? 'प्रश्न' : 'Ask Back', text: isHi ? 'क्या समय हुआ है?' : 'What time is it?' },
    other: { role: 'other', tag: isHi ? 'अन्य' : 'Other', text: isHi ? 'बहुत धन्यवाद' : 'Thank you so much.' }
  };
}

export function getOfflineReplies(utterance = '', lang = 'en-IN') {
  const roleObj = getOfflineRoleReplies(utterance, lang);
  return Object.values(roleObj);
}
