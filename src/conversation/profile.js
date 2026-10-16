// Patient profile management stored in localStorage

const STORAGE_KEY = 'gaze_voice_patient_profile';

const DEFAULT_PROFILE = {
  name: 'Aarav Sharma',
  condition: 'ALS / Locked-in speech impairment, uses eye-gaze',
  familyNames: 'Priya (wife), Rohan (son), Dr. Mehta (neurologist)',
  usualNeeds: 'Water with straw, adjust pillow, suction, pain relief, turn on fan',
  notes: 'Prefers concise options. Speaks English and Hindi.'
};

export function getProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch (err) {
    console.warn('Failed to read profile from localStorage:', err);
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (err) {
    console.warn('Failed to save profile to localStorage:', err);
  }
}
