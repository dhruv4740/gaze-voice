// Topics for patient-initiated conversations and home device requests

export const TOPICS = [
  {
    id: 'feelings',
    label: 'Feelings',
    tag: 'Emotion',
    icon: '',
    tiles: [
      { text: 'I am feeling happy today', tag: 'Feeling' },
      { text: 'I feel very tired', tag: 'Feeling' },
      { text: 'Feeling anxious or restless', tag: 'Feeling' },
      { text: 'I am comfortable right now', tag: 'Feeling' },
      { text: 'I feel a bit confused', tag: 'Feeling' },
      { text: 'I love you all', tag: 'Feeling' }
    ]
  },
  {
    id: 'body',
    label: 'Body & Pain',
    tag: 'Physical',
    icon: '',
    tiles: [
      { text: 'Headache is bothering me', tag: 'Pain' },
      { text: 'My lower back is aching', tag: 'Pain' },
      { text: 'Legs are cramping up', tag: 'Pain' },
      { text: 'My skin feels itchy', tag: 'Physical' },
      { text: 'I feel too cold', tag: 'Physical' },
      { text: 'I feel too hot', tag: 'Physical' }
    ]
  },
  {
    id: 'people',
    label: 'People',
    tag: 'Contact',
    icon: '',
    tiles: [
      { text: 'Please call Priya', tag: 'Contact' },
      { text: 'Please call Rohan', tag: 'Contact' },
      { text: 'Please call Nurse Riya', tag: 'Contact' },
      { text: 'Please call Dr. Mehta', tag: 'Contact' },
      { text: 'Who is outside the room?', tag: 'Question' },
      { text: 'Please stay with me', tag: 'Contact' }
    ]
  },
  {
    id: 'needs',
    label: 'Care Needs',
    tag: 'Daily Care',
    icon: '',
    tiles: [
      { text: 'Water with straw please', tag: 'Need' },
      { text: 'Please adjust my pillow', tag: 'Need' },
      { text: 'Need oral suction now', tag: 'Need' },
      { text: 'Need to use bathroom', tag: 'Need' },
      { text: 'Cover me with blanket', tag: 'Need' },
      { text: 'Time for my medication', tag: 'Need' }
    ]
  },
  {
    id: 'home',
    label: 'Home & Nurse',
    tag: 'Smart Home',
    icon: '',
    tiles: [
      { text: 'Turn on the lights', tag: 'Home', kind: 'lights', label: 'Lights On' },
      { text: 'Turn off the lights', tag: 'Home', kind: 'lights', label: 'Lights Off' },
      { text: 'Turn on the fan', tag: 'Home', kind: 'fan', label: 'Fan On' },
      { text: 'Turn on the TV', tag: 'Home', kind: 'tv', label: 'TV On' },
      { text: 'Call Nurse immediately', tag: 'Home', kind: 'nurse', label: 'Call Nurse' },
      { text: 'Please open the door', tag: 'Home', kind: 'door', label: 'Open Door' }
    ]
  }
];

export function dispatchHomeRequest(kind, label) {
  try {
    const event = new CustomEvent('aac:request', {
      detail: { kind, label }
    });
    window.dispatchEvent(event);
  } catch (err) {
    console.warn('Failed to dispatch aac:request:', err);
  }
}

export function getWhatsAppShareUrl(text) {
  if (!text) return '';
  return `https://wa.me/?text=${encodeURIComponent(text.trim())}`;
}
