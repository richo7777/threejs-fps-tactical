// audio.js — Dustline sound: every sound is synthesized with WebAudio.
// No audio files, no network. The AudioContext is created lazily and stays
// silent until unlock() is called from a user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let lastStep = 0;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 1;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') void c.resume();
  }

  function noise(dur, { type = 'lowpass', freq = 1200, q = 0.8, gain = 0.6, at = 0, sweepTo = null } = {}) {
    if (!ctx || !master || !noiseBuf) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, { type = 'sine', gain = 0.4, at = 0, slideTo = null } = {}) {
    if (!ctx || !master) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  const SHOTS = {
    pistol: () => { noise(0.09, { type: 'highpass', freq: 900, gain: 0.7 }); tone(220, 0.07, { type: 'square', gain: 0.25, slideTo: 90 }); },
    smg: () => { noise(0.07, { type: 'bandpass', freq: 1800, q: 1.2, gain: 0.55 }); tone(300, 0.05, { type: 'square', gain: 0.18, slideTo: 140 }); },
    rifle: () => { noise(0.14, { type: 'lowpass', freq: 2600, gain: 0.8, sweepTo: 300 }); tone(160, 0.12, { type: 'sawtooth', gain: 0.3, slideTo: 60 }); },
    sniper: () => { noise(0.35, { type: 'lowpass', freq: 1400, gain: 1.0, sweepTo: 120 }); tone(110, 0.3, { type: 'sawtooth', gain: 0.4, slideTo: 40 }); },
  };

  function shot(weaponId) {
    if (!ctx) return;
    (SHOTS[weaponId] || SHOTS.rifle)();
  }

  function reload() {
    if (!ctx) return;
    tone(1400, 0.04, { type: 'square', gain: 0.15 });
    tone(900, 0.04, { type: 'square', gain: 0.15, at: 0.12 });
    tone(1600, 0.05, { type: 'square', gain: 0.2, at: 0.32 });
  }

  function hit() {
    if (!ctx) return;
    tone(2400, 0.05, { type: 'square', gain: 0.22 });
  }

  function kill() {
    if (!ctx) return;
    tone(1800, 0.06, { type: 'square', gain: 0.25 });
    tone(2600, 0.09, { type: 'square', gain: 0.25, at: 0.07 });
  }

  function explosion() {
    if (!ctx) return;
    noise(1.1, { type: 'lowpass', freq: 900, gain: 1.0, sweepTo: 60 });
    tone(70, 0.9, { type: 'sine', gain: 0.7, slideTo: 28 });
    noise(0.25, { type: 'highpass', freq: 2000, gain: 0.4 });
  }

  function beep() {
    if (!ctx) return;
    tone(1100, 0.09, { type: 'square', gain: 0.25 });
  }

  function plant() {
    if (!ctx) return;
    for (let i = 0; i < 4; i++) tone(880 + i * 110, 0.08, { type: 'square', gain: 0.2, at: i * 0.11 });
  }

  function defuse() {
    if (!ctx) return;
    for (let i = 0; i < 4; i++) tone(1320 - i * 110, 0.08, { type: 'square', gain: 0.2, at: i * 0.11 });
  }

  function roundWin() {
    if (!ctx) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => tone(f, 0.22, { type: 'triangle', gain: 0.3, at: i * 0.13 }));
  }

  function roundLose() {
    if (!ctx) return;
    const notes = [392, 330, 262, 196];
    notes.forEach((f, i) => tone(f, 0.25, { type: 'triangle', gain: 0.28, at: i * 0.14 }));
  }

  function step() {
    if (!ctx) return;
    const now = performance.now();
    if (now - lastStep < 240) return; // throttle: footsteps must not pile up
    lastStep = now;
    noise(0.05, { type: 'lowpass', freq: 500, gain: 0.12 });
  }

  return { shot, reload, hit, kill, explosion, beep, plant, defuse, roundWin, roundLose, step, unlock };
}
