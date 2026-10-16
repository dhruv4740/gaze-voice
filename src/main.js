// Shared entry point. Owned by Opus; ask before changing.
// Wires the two halves together through the contract in docs/CONTRACT.md.
import { startGaze } from './gaze/index.js';
import { startConversation } from './conversation/index.js';

const params = new URLSearchParams(location.search);
// ?mode=mouse | eyes | head  (mouse works today; eyes/head arrive from Team A)
const mode = params.get('mode') || 'mouse';

startConversation(document.getElementById('app'));
startGaze({ mode, root: document.getElementById('gaze-root') });
