// One webcam stream shared by the face and hand landmarkers (combined inputs). Each new video
// frame goes to ONE subscriber in turn, so two models share the frame budget instead of both
// running on every frame. Frames stay in the browser.
export function createSharedCamera() {
  let video = null; let stream = null; let raf = 0; let running = false; let last = -1; let n = 0;
  const subs = [];
  const loop = () => {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (video.currentTime === last || video.readyState < 2 || !subs.length) return;
    last = video.currentTime;
    subs[n++ % subs.length](performance.now());
  };
  return {
    get video() { return video; },
    subscribe(fn) { subs.push(fn); },
    async open() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
      } catch (err) {
        const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
        throw new Error(denied ? 'Camera permission denied' : 'Camera unavailable');
      }
      video = document.createElement('video');
      video.className = 'gaze-head-preview';
      video.muted = true; video.playsInline = true; video.srcObject = stream;
      document.body.appendChild(video);
      await video.play();
    },
    begin() { if (!running) { running = true; loop(); } },
    close() { running = false; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); video?.remove(); },
  };
}

// Per-landmarker frame rate and detect cost, for window.__gazeFps = { face: {fps, ms}, hand: {fps, ms} }.
export function createMeter(key) {
  let frames = 0; let t0 = 0; let cost = 0;
  return (now, ms) => {
    if (!t0) t0 = now;
    frames++; cost += ms;
    if (now - t0 >= 1000) {
      const g = (window.__gazeFps ||= {});
      g[key] = { fps: Math.round((frames * 1000) / (now - t0)), ms: Math.round((cost / frames) * 10) / 10 };
      if (key === 'hand') window.__handStats = { fps: g[key].fps, detectMs: g[key].ms };
      frames = 0; cost = 0; t0 = now;
    }
  };
}
