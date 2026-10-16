// Team B (teammate) owns everything in src/conversation/.
// Placeholder tiles that prove the contract works end to end.

const STARTER = ['Yes, please', 'No, not now', "I'm thirsty", 'Call my son', "I'm in pain", 'Spell it'];

export function startConversation(app) {
  app.innerHTML = `
    <p id="heard">Heard: —</p>
    <section id="tiles">${STARTER.map((t) => `<button data-gaze-target>${t}</button>`).join('')}</section>
  `;
  app.addEventListener('gaze-select', (e) => {
    const text = e.target.textContent;
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  });
}
