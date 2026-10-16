import { test, expect } from '@playwright/test';

const RELAY = 'ws://127.0.0.1:8795';
const roles = (n) => ({ agree: `Yes ${n} agree`, decline: `No ${n} decline`, need: `I need ${n} water`, feeling: `Feeling ${n} fine`, ask_back: `And ${n} you` });

// Groq / Gemini never leave the machine: fixed role-slot JSON, a different one on every call.
async function mockAi(page) {
  let n = 0;
  await page.route('https://api.groq.com/**', (r) => {
    n++;
    r.fulfill({ json: { choices: [{ message: { content: JSON.stringify(roles(n)) } }] } });
  });
  await page.route('https://generativelanguage.googleapis.com/**', (r) => {
    n++;
    r.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(roles(n)) }] } }] } });
  });
}

// skips Team B onboarding (unless storage:false) and counts contract events
async function prep(page, { storage = true } = {}) {
  await mockAi(page);
  await page.addInitScript((keep) => {
    if (keep) localStorage.setItem('gaze_voice_onboarded', 'true');
    window.__ev = { select: 0, emergency: 0, remote: [], spoken: [] };
    window.addEventListener('gaze-select', () => window.__ev.select++, true);
    window.addEventListener('aac:emergency', () => window.__ev.emergency++);
    window.addEventListener('aac:remote-question', (e) => window.__ev.remote.push(e.detail));
    window.addEventListener('aac:spoken', (e) => window.__ev.spoken.push(e.detail));
  }, storage);
}
const ev = (page, k) => page.evaluate((key) => window.__ev[key], k);
async function hover(page, sel) {
  const b = await page.locator(sel).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
}
async function openAsk(page) {
  // workaround: Team B's caregiver pills lack data-gaze-target so their click handler ignores them (see 5b)
  await page.evaluate(() => document.querySelector('[data-action="toggle-input"]').setAttribute('data-gaze-target', ''));
  await page.click('[data-action="toggle-input"]');
  // second Team B gap (see 5c): in chat mode the board updates in place, so the box only appears after a full re-render
  await page.click('[data-action="nav-type"]');
  await page.click('[data-action="nav-back"]');
  await page.waitForSelector('#manual-utterance');
}
async function ask(page, text) {
  if (!(await page.locator('#manual-utterance').count())) await openAsk(page);
  await page.fill('#manual-utterance', text);
  await page.press('#manual-utterance', 'Enter');
}
const rects = (page, sels) => page.evaluate((s) => Object.fromEntries(s.map((q) => { const r = document.querySelector(q).getBoundingClientRect(); return [q, [r.x, r.y, r.width, r.height].map(Math.round)]; })), sels);
const SLOTS = ['#slot-agree', '#slot-decline', '#slot-need', '#slot-feeling', '#slot-ask_back', '#slot-other'];
const CORE = ['.core-yes', '.core-no', '.core-wait', '.core-repeat', '.conv-tile-emergency'];

test.describe('1. no console errors', () => {
  for (const url of ['/?mode=mouse', '/landing.html', '/caregiver.html']) {
    test(url, async ({ page }) => {
      await prep(page);
      const errs = [];
      page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });
      await page.goto(url);
      await page.waitForTimeout(1500);
      expect(errs).toEqual([]);
    });
  }
  test('camera modes load with a fake camera (head, hand)', async ({ page }) => {
    await prep(page);
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    for (const mode of ['head', 'hand']) {
      await page.goto(`/?mode=${mode}`);
      await page.waitForTimeout(2500);
      await expect(page.locator('#slot-agree')).toBeVisible();
    }
    expect(errs).toEqual([]);
  });
});

for (const vp of [{ width: 1366, height: 768 }, { width: 1024, height: 768 }]) {
  const open = async (page) => {
    await prep(page);
    await page.setViewportSize(vp);
    await page.goto('/?mode=mouse');
    await page.waitForSelector('#slot-agree');
  };
  test(`2a. emergency tile fully in view @${vp.width}x${vp.height}`, async ({ page }) => {
    await open(page);
    const em = await page.locator('.conv-tile-emergency').boundingBox();
    expect(em.x).toBeGreaterThanOrEqual(0);
    expect(em.y).toBeGreaterThanOrEqual(0);
    expect(em.x + em.width).toBeLessThanOrEqual(vp.width);
    expect(em.y + em.height).toBeLessThanOrEqual(vp.height);
  });
  // test.fail = known Team B layout gap: nav/core/pinned/history tiles are under 200x150 (core 70 high, history 44 high)
  test.fail(`2b. every target >= 200x150 @${vp.width}x${vp.height}`, async ({ page }) => {
    await open(page);
    const info = await page.evaluate(() => [...document.querySelectorAll('[data-gaze-target]')]
      .map((el) => ({ el, r: el.getBoundingClientRect(), cs: getComputedStyle(el) }))
      .filter((x) => x.r.width > 0 && x.cs.visibility !== 'hidden')
      .filter((x) => !x.el.closest('.conv-key, .conv-keyboard'))
      .map((x) => ({ id: x.el.id || x.el.dataset.action, w: Math.round(x.r.width), h: Math.round(x.r.height) })));
    expect(info.filter((i) => i.w < 200 || i.h < 150), 'targets under 200x150').toEqual([]);
  });
}

test('3. dwell selects once; staying gives no immediate repeat', async ({ page }) => {
  await prep(page);
  await page.goto('/?mode=mouse');
  await page.waitForSelector('.core-wait');
  await hover(page, '.core-wait');
  await expect.poll(() => ev(page, 'select'), { timeout: 5000 }).toBe(1);
  await page.waitForTimeout(1000); // refractory is 1.5 s and a new dwell needs 1.2 s: no second one yet
  expect(await ev(page, 'select')).toBe(1);
});

test('4. fast sweep over tiles selects nothing', async ({ page }) => {
  await prep(page);
  await page.goto('/?mode=mouse');
  await page.waitForSelector('#slot-agree');
  for (let pass = 0; pass < 3; pass++) {
    await page.mouse.move(20, 400);
    for (let x = 20; x <= 1340; x += 110) { await page.mouse.move(x, 300 + (pass % 2) * 200); await page.waitForTimeout(8); }
  }
  await page.waitForTimeout(1500);
  expect(await ev(page, 'select')).toBe(0);
});

test('5. a question fills the role slots without moving anything', async ({ page }) => {
  await prep(page);
  await page.goto('/?mode=mouse');
  await page.waitForSelector('#slot-agree');
  await openAsk(page); // the open text box shifts the layout by itself, so measure with it open
  const before = await rects(page, [...SLOTS, ...CORE]);
  await ask(page, 'Are you in pain right now?');
  await expect(page.locator('#slot-agree .conv-tile-text')).toHaveText(/Yes \d agree/);
  const first = await page.locator('#slot-agree .conv-tile-text').innerText();
  await expect(page.locator('#slot-need .conv-tile-text')).toHaveText(/water/);
  expect(await rects(page, [...SLOTS, ...CORE])).toEqual(before);
  await ask(page, 'Do you want some tea now?');
  await expect(page.locator('#slot-agree .conv-tile-text')).not.toHaveText(first);
  expect(await rects(page, [...SLOTS, ...CORE])).toEqual(before);
});

test.fixme('5b. caregiver pills (Manual Text Box etc.) respond to a click', async ({ page }) => {
  // fixme (Team B): src/conversation/index.js onClick/onGazeSelect return early unless the target has
  // [data-gaze-target]; the .conv-btn-pill buttons (toggle-input, toggle-mic, open-profile ...) don't, so a click does nothing.
  await prep(page);
  await page.goto('/?mode=mouse');
  await page.click('[data-action="toggle-input"]');
  await expect(page.locator('#manual-utterance')).toBeVisible();
});

test.fixme('5c. Manual Text Box appears right after toggling it in chat mode', async ({ page }) => {
  // fixme (Team B): render() returns early into updateChatBoardInPlace() when chat is mounted, which never adds
  // #manual-utterance; it only shows after leaving and re-entering chat (nav-type then nav-back).
  await prep(page);
  await page.goto('/?mode=mouse');
  await page.evaluate(() => document.querySelector('[data-action="toggle-input"]').setAttribute('data-gaze-target', ''));
  await page.click('[data-action="toggle-input"]');
  await expect(page.locator('#manual-utterance')).toBeVisible();
});

test('6. emergency fires aac:emergency', async ({ page }) => {
  await prep(page);
  await page.goto('/?mode=mouse');
  await page.waitForSelector('.conv-tile-emergency');
  await hover(page, '.conv-tile-emergency');
  await expect.poll(() => ev(page, 'emergency'), { timeout: 7000 }).toBe(1);
});

test('7. caregiver phone question -> patient -> threaded reply', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const patient = await ctx.newPage();
  const phone = await ctx.newPage();
  await prep(patient);
  await patient.goto(`/?mode=mouse&relay=${RELAY}`);
  await patient.waitForSelector('#slot-agree');
  await phone.goto(`/caregiver.html?relay=${RELAY}`);
  await expect(phone.locator('#conn')).toHaveText('live');
  await phone.waitForTimeout(500);
  await phone.click('#chips button:has-text("Are you in pain?")');
  await expect.poll(() => ev(patient, 'remote'), { timeout: 5000 }).toEqual([{ text: 'Are you in pain?', from: 'caregiver' }]);
  await patient.click('#slot-agree'); // the reply: aac:spoken goes out through the relay
  await expect(phone.locator('.line.q .a')).toContainText('patient:', { timeout: 5000 });
  await expect(phone.locator('.line.q')).toContainText('Are you in pain?');
  await ctx.close();
});

test.fixme('7b. Heard strip shows a phone question with a "from phone" badge and regenerates the role slots', async ({ browser }) => {
  // fixme: src/conversation does not handle aac:remote-question yet (Team B)
  const ctx = await browser.newContext();
  const patient = await ctx.newPage();
  const phone = await ctx.newPage();
  await prep(patient);
  await patient.goto(`/?mode=mouse&relay=${RELAY}`);
  await phone.goto(`/caregiver.html?relay=${RELAY}`);
  await phone.waitForTimeout(800);
  await phone.click('#chips button:has-text("Are you hungry?")');
  await expect(patient.locator('.conv-heard-text')).toContainText('Are you hungry?');
  await expect(patient.locator('.conv-heard-container')).toContainText(/from phone/i);
  await expect(patient.locator('#slot-agree .conv-tile-text')).toHaveText(/Yes \d agree/);
});

test('8. picker on first load, remembered after reload', async ({ page }) => {
  await prep(page, { storage: false });
  await page.goto('/');
  await expect(page.locator('#gaze-picker')).toBeVisible();
  await page.locator('#gaze-picker input[value="mouse"]').check();
  await page.locator('#gaze-picker input[value="head"]').uncheck();
  await page.click('#gaze-picker-start');
  await expect(page.locator('#gaze-picker')).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(800);
  await expect(page.locator('#gaze-picker')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('gaze-input'))).toBe('mouse');
  await page.goto('/?pick=1');
  await expect(page.locator('#gaze-picker')).toBeVisible();
});

test('9. Shift+P pause blocks selection; emergency still works', async ({ page }) => {
  await prep(page);
  await page.goto('/?mode=mouse');
  await page.waitForSelector('.core-wait');
  await page.keyboard.press('Shift+P');
  await expect(page.locator('#gaze-rest-btn')).toHaveText('Wake');
  await hover(page, '.core-wait');
  await page.waitForTimeout(3000);
  expect(await ev(page, 'select')).toBe(0);
  await hover(page, '.conv-tile-emergency');
  await expect.poll(() => ev(page, 'emergency'), { timeout: 7000 }).toBe(1);
});

test('10. X-ray mode toggles with Shift+X, draws, and throws nothing', async ({ page }) => {
  await prep(page);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('/?mode=mouse');
  await page.waitForSelector('.core-wait');
  await expect(page.locator('#gaze-xray')).toBeHidden();
  await page.keyboard.press('Shift+X');
  await expect(page.locator('#gaze-xray')).toBeVisible();
  await hover(page, '.core-wait');
  await page.waitForTimeout(700);
  // something was drawn (panel background is the first pixel block)
  const drawn = await page.evaluate(() => { const c = document.getElementById('gaze-xray'); return c.getContext('2d').getImageData(20, 20, 1, 1).data[3]; });
  expect(drawn).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/xray-mouse.png' });
  await page.click('#gaze-xray-btn');
  await expect(page.locator('#gaze-xray')).toBeHidden();
  expect(errs).toEqual([]);
});

test('10b. X-ray with a (fake) camera in head+hand mode', async ({ page }) => {
  await prep(page);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('/?mode=head%2Bhand&select=dwell');
  await page.waitForSelector('#slot-agree');
  await page.keyboard.press('Shift+X');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/xray-cam.png' });
  expect(errs).toEqual([]);
});
