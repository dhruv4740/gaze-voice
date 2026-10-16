// Spell mode: 6 letter-group tiles -> individual letters -> predictive completions

import { predictWordCompletions } from './groq.js';

export const LETTER_GROUPS = [
  { id: 'g1', label: 'A  B  C  D', letters: ['A', 'B', 'C', 'D'] },
  { id: 'g2', label: 'E  F  G  H', letters: ['E', 'F', 'G', 'H'] },
  { id: 'g3', label: 'I  J  K  L  M', letters: ['I', 'J', 'K', 'L', 'M'] },
  { id: 'g4', label: 'N  O  P  Q  R', letters: ['N', 'O', 'P', 'Q', 'R'] },
  { id: 'g5', label: 'S  T  U  V', letters: ['S', 'T', 'U', 'V'] },
  { id: 'g6', label: 'W  X  Y  Z', letters: ['W', 'X', 'Y', 'Z'] }
];

export class SpellEngine {
  constructor({ onBufferChange, onPredictionsChange }) {
    this.buffer = '';
    this.activeGroup = null; // null means viewing groups
    this.predictions = [];
    this.onBufferChange = onBufferChange;
    this.onPredictionsChange = onPredictionsChange;
  }

  getCurrentWordPrefix() {
    const words = this.buffer.trim().split(/\s+/);
    return words.length > 0 ? words[words.length - 1] : '';
  }

  async updatePredictions() {
    const prefix = this.getCurrentWordPrefix();
    if (prefix.length >= 2) {
      try {
        const words = await predictWordCompletions(prefix);
        this.predictions = words;
        this.onPredictionsChange?.(this.predictions);
      } catch (err) {
        console.warn('Prediction error:', err);
      }
    } else {
      this.predictions = [];
      this.onPredictionsChange?.(this.predictions);
    }
  }

  selectGroup(groupId) {
    this.activeGroup = LETTER_GROUPS.find((g) => g.id === groupId) || null;
  }

  clearGroup() {
    this.activeGroup = null;
  }

  addLetter(char) {
    this.buffer += char;
    this.activeGroup = null; // return to groups for fast next letter
    this.onBufferChange?.(this.buffer);
    this.updatePredictions();
  }

  addSpace() {
    if (this.buffer.length > 0 && !this.buffer.endsWith(' ')) {
      this.buffer += ' ';
      this.activeGroup = null;
      this.predictions = [];
      this.onBufferChange?.(this.buffer);
      this.onPredictionsChange?.(this.predictions);
    }
  }

  backspace() {
    if (this.buffer.length > 0) {
      this.buffer = this.buffer.slice(0, -1);
      this.onBufferChange?.(this.buffer);
      this.updatePredictions();
    }
  }

  clear() {
    this.buffer = '';
    this.activeGroup = null;
    this.predictions = [];
    this.onBufferChange?.(this.buffer);
    this.onPredictionsChange?.(this.predictions);
  }

  selectPrediction(completedWord) {
    const words = this.buffer.split(/\s+/);
    words.pop(); // remove current prefix
    words.push(completedWord);
    this.buffer = words.join(' ') + ' ';
    this.activeGroup = null;
    this.predictions = [];
    this.onBufferChange?.(this.buffer);
    this.onPredictionsChange?.(this.predictions);
  }
}
