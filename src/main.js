// Shared entry point. Owned by Opus; ask before changing.
// Wires the two halves together through the contract in docs/CONTRACT.md.
import { startGaze } from './gaze/index.js';
import { startConversation } from './conversation/index.js';

const params = new URLSearchParams(location.search);
// ?mode=mouse | eyes | iris | head | hand | scan. No ?mode: the saved input choice, or the input picker.
const mode = params.get('mode') || null;

startConversation(document.getElementById('app'));
startGaze({ mode, root: document.getElementById('gaze-root') });
