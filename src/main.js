// Shared entry point. Owned by Opus; ask before changing.
// Wires the two halves together through the contract in docs/CONTRACT.md.
import { startGaze } from './gaze/index.js';
import { startConversation } from './conversation/index.js';

const params = new URLSearchParams(location.search);
// ?mode=mouse | eyes | iris | head; default head (steadiest), falls back to mouse if the camera is denied
const mode = params.get('mode') || 'head';

startConversation(document.getElementById('app'));
startGaze({ mode, root: document.getElementById('gaze-root') });
