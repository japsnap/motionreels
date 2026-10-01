// Generates the soundtrack from code: a music bed and sound effects, all synthesised here,
// so no third-party recording is ever used and nothing needs a licence.
// The page declares it:
//   MR.config({ sound: { music: 'groove', energy: [[0, 1], [5, 3], [18, 2]] } })  and  MR.cue(1.2, 'pop')
// Eight base styles. Every video crafts its own track from a seed (default: the video's name):
// tempo, key, brightness, detune, swing, voicing, drum kit tuning, patterns, melody and room size all
// move, so two videos never share music. render.mjs logs each track in ~/.motionreels/used.json and
// refuses an exact repeat.
// Sound quality (2026-10-01): band-limited oscillators, resonant filters with envelopes, supersaw pads,
// FM keys and bells, 808-style metallic hats, reverb and ping-pong delay sends, sidechain ducking,
// a master compressor and limiter.
// Usage (render.mjs calls this):  buildAudio(meta, 'out/sound.wav')
import fs from 'node:fs';

const SR = 44100;

// ---------- basics ----------
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const semi = (s) => Math.pow(2, s / 12);
const stereo = (n) => ({ L: new Float32Array(n), R: new Float32Array(n) });

// polyBLEP band-limited oscillators (no harsh aliasing on saw and square)
const blep = (t, dt) => { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; };
function oscSample(wave, ph, dt) {
  if (wave === 'sine') return Math.sin(2 * Math.PI * ph);
  if (wave === 'tri') return 1 - 4 * Math.abs(ph - 0.5);
  if (wave === 'saw') return 2 * ph - 1 - blep(ph, dt);
  let v = ph < 0.5 ? 1 : -1; v += blep(ph, dt); v -= blep((ph + 0.5) % 1, dt); return v;
}
// zero-delay state-variable filter (stable when the cutoff moves every sample)
class SVF {
  constructor() { this.a = 0; this.b = 0; this.fc = -1; }
  run(x, fc, q, mode) {
    if (fc !== this.fc) { this.fc = fc; const g = Math.tan(Math.PI * Math.min(Math.max(fc, 20), SR * 0.45) / SR); this.k = 1 / q; this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2; }
    const v3 = x - this.b, v1 = this.a1 * this.a + this.a2 * v3, v2 = this.b + this.a2 * this.a + this.a3 * v3;
    this.a = 2 * v1 - this.a; this.b = 2 * v2 - this.b;
    return mode === 'lp' ? v2 : mode === 'bp' ? v1 : x - this.k * v1 - v2;
  }
}
function envAt(t, len, { a = 0.005, d = 0.3, s = 0.6, r = 0.08 }) {
  const gate = Math.max(a, len - r);
  const lv = (x) => (x < a ? x / a : s + (1 - s) * Math.exp(((x - a) / Math.max(1e-4, d)) * -3));
  return t < gate ? lv(t) : lv(gate) * Math.max(0, 1 - (t - gate) / r);
}

// One synth voice stack: oscillators (or FM), filter with envelope, amp envelope, stereo spread.
function synth(len, f, o = {}) {
  const n = Math.ceil(len * SR), out = stereo(n), V = o.voices || 1, wave = o.wave || 'saw';
  const amp = o.amp || {};
  for (let v = 0; v < V; v++) {
    const side = V > 1 ? (v / (V - 1)) * 2 - 1 : 0;
    const fv = f * Math.pow(2, (side * (o.detune || 0)) / 1200);
    const pan = V > 1 ? side * (o.spread || 0) : o.pan || 0;
    const gl = Math.min(1, 1 - pan) / Math.sqrt(V), gr = Math.min(1, 1 + pan) / Math.sqrt(V);
    let ph = (v * 0.618) % 1, mph = 0;
    const filt = o.cut ? new SVF() : null;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let fr = o.f2 ? fv * Math.pow(o.f2 / f, Math.min(1, t / (o.glide || len))) : fv;
      if (o.vib) fr *= 1 + o.vib * Math.sin(2 * Math.PI * (o.vibRate || 5) * t) * Math.min(1, t / 0.3);
      let x;
      if (o.fm) { mph += (o.fm.ratio * fr) / SR; x = Math.sin(2 * Math.PI * ph + o.fm.index * Math.exp(-t / (o.fm.decay || 0.3)) * Math.sin(2 * Math.PI * mph)); }
      else x = oscSample(wave, ph, fr / SR);
      ph += fr / SR; ph -= Math.floor(ph);
      if (filt) x = filt.run(x, o.cut + (o.cutEnv || 0) * Math.exp(-t / (o.cutDecay || 0.2)), o.res || 0.7, 'lp');
      if (o.drive) x = Math.tanh(x * o.drive) / Math.tanh(o.drive);
      const e = envAt(t, len, amp);
      out.L[i] += x * e * gl; out.R[i] += x * e * gr;
    }
  }
  return out;
}
// filtered noise with an envelope
function fnoise(len, { seed = 1, mode = 'hp', fc = 2000, q = 0.7, decay = 0.1, attack = 0.001 } = {}) {
  const n = Math.ceil(len * SR), out = new Float32Array(n), r = rng(seed), f = new SVF();
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] = f.run(r() * 2 - 1, typeof fc === 'function' ? fc(t / len) : fc, q, mode) * Math.min(1, t / attack) * Math.exp(-t / decay); }
  return out;
}
// 808-style metallic tone: six square waves, then high-pass and band-pass
function metallic(len, decay, tune = 1) {
  const n = Math.ceil(len * SR), out = new Float32Array(n), hp = new SVF(), bp = new SVF();
  const fs6 = [205.3, 304.4, 369.6, 522.7, 540, 800].map((x) => x * tune), ph = fs6.map(() => 0);
  for (let i = 0; i < n; i++) {
    let x = 0;
    for (let j = 0; j < 6; j++) { ph[j] += fs6[j] / SR; ph[j] -= Math.floor(ph[j]); x += ph[j] < 0.5 ? 1 : -1; }
    x = bp.run(hp.run(x / 6, 7000, 0.7, 'hp'), 10000, 0.9, 'bp');
    out[i] = x * Math.exp(-(i / SR) / decay);
  }
  return out;
}
function mix(bus, src, at, gain = 1, pan = 0) {
  const start = Math.round(at * SR), N = bus.L.length;
  if (src instanceof Float32Array) {
    const gl = gain * Math.min(1, 1 - pan), gr = gain * Math.min(1, 1 + pan);
    for (let i = 0; i < src.length; i++) { const j = start + i; if (j < 0 || j >= N) continue; bus.L[j] += src[i] * gl; bus.R[j] += src[i] * gr; }
  } else {
    const gl = gain * Math.min(1, 1 - pan), gr = gain * Math.min(1, 1 + pan);
    for (let i = 0; i < src.L.length; i++) { const j = start + i; if (j < 0 || j >= N) continue; bus.L[j] += src.L[i] * gl; bus.R[j] += src.R[i] * gr; }
  }
}

// ---------- effects busses ----------
function reverb(bus, size = 0.84, damp = 0.25) {
  const n = bus.L.length, out = stereo(n);
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], aps = [556, 441, 341, 225];
  for (const [src, dst, spread] of [[bus.L, out.L, 0], [bus.R, out.R, 23]]) {
    const cb = combs.map((c) => ({ buf: new Float32Array(c + spread), i: 0, lp: 0 }));
    const ab = aps.map((c) => ({ buf: new Float32Array(c + spread), i: 0 }));
    for (let i = 0; i < n; i++) {
      const x = src[i] * 0.015;
      let y = 0;
      for (const c of cb) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * size; c.i = (c.i + 1) % c.buf.length; y += o; }
      for (const a of ab) { const o = a.buf[a.i]; a.buf[a.i] = y + o * 0.5; a.i = (a.i + 1) % a.buf.length; y = o - y; }
      dst[i] = y;
    }
  }
  return out;
}
function pingpong(bus, time, fb = 0.35) {
  const n = bus.L.length, out = stereo(n), d = Math.round(time * SR), lp = [0, 0];
  for (let i = d; i < n; i++) {
    lp[0] = lp[0] * 0.4 + (bus.L[i - d] + out.R[i - d] * fb) * 0.6;
    lp[1] = lp[1] * 0.4 + (bus.R[i - d] + out.L[i - d] * fb) * 0.6;
    out.L[i] = lp[1]; out.R[i] = lp[0];
  }
  return out;
}

// ---------- sound effects (names are the public contract; check.mjs validates them) ----------
// Simple one-shot helpers for effects.
function tone(sec, f, { type = 'sine', decay = sec, attack = 0.004, f2 = null, vib = 0, vibRate = 0 } = {}) {
  const n = Math.ceil(sec * SR), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, p = t / sec;
    const fr = (f2 === null ? f : f * Math.pow(f2 / f, p)) * (1 + vib * Math.sin(2 * Math.PI * vibRate * t) * (1 - p));
    ph += fr / SR; ph -= Math.floor(ph);
    out[i] = oscSample(type === 'square' || type === 'saw' || type === 'tri' ? type : 'sine', ph, fr / SR) * Math.min(1, t / attack) * Math.exp(-t / (decay / 5));
  }
  return out;
}
function noise(sec, { decay = sec, seed = 1, lp = 1, hp = 0, sweep = null, poles = 1 } = {}) {
  const n = Math.ceil(sec * SR), out = new Float32Array(n), r = rng(seed);
  let low = 0, low2 = 0, prevIn = 0, high = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, p = t / sec;
    const a = sweep ? sweep(p) : lp;
    low += a * (r() * 2 - 1 - low); low2 += a * (low - low2);
    const lo = poles > 1 ? low2 : low;
    high = hp ? hp * (high + lo - prevIn) : lo; prevIn = lo;
    out[i] = high * (sweep ? Math.sin(Math.PI * p) : Math.exp(-t / (decay / 5)));
  }
  return out;
}
const sum = (...parts) => { const n = Math.max(...parts.map(([b, , off = 0]) => b.length + Math.round(off * SR))), out = new Float32Array(n); for (const [b, g, off = 0] of parts) { const o = Math.round(off * SR); for (let i = 0; i < b.length && i + o < n; i++) out[i + o] += b[i] * g; } return out; };
const gainOf = (b, g) => b.map((v) => v * g);
const shape = (b, drive) => b.map((v) => Math.tanh(v * drive) / Math.tanh(drive));
const monoOf = (s) => s.L.map((v, i) => (v + s.R[i]) * 0.5);
// a pachinko ball: two inharmonic metal partials, very short
const ball = (f, r) => sum([tone(0.03, f, { decay: 0.018 }), 0.6], [tone(0.03, f * 2.71, { decay: 0.01 }), 0.3], [noise(0.006, { lp: 0.9, hp: 0.7, decay: 0.004, seed: Math.floor(r() * 1e5) }), 0.3]);
function balls(len, count, density, v, freq = 3400) {
  const r = rng(v.s), out = new Float32Array(Math.ceil(len * SR));
  for (let k = 0; k < count; k++) {
    const at = density(r()) * len, b = ball(freq * v.p * (0.85 + r() * 0.5), r), j = Math.round(at * SR);
    for (let i = 0; i < b.length && j + i < out.length; i++) out[j + i] += b[i] * (0.5 + r() * 0.5);
  }
  return out;
}

// Each takes v = { p: pitch multiplier, s: seed }. buildAudio gives every video its own p and s per
// effect name, plus a small change on every repeat, so no two videos (and no two hits) sound the same.
export const SFX = {
  pop: (v) => tone(0.12, 520 * v.p, { f2: 1250 * v.p, decay: 0.1 }),
  click: (v) => sum([noise(0.02, { lp: 0.9, hp: 0.6, decay: 0.012, seed: v.s }), 0.8], [tone(0.02, 2200 * v.p, { decay: 0.012 }), 0.3]),
  whoosh: (v) => gainOf(noise(0.45 / Math.sqrt(v.p), { seed: v.s, poles: 2, sweep: (p) => 0.015 + 0.13 * v.p * Math.sin(Math.PI * p) }), 1.6),
  swoosh: (v) => gainOf(noise(0.3, { seed: v.s, poles: 2, sweep: (p) => 0.02 + 0.16 * v.p * Math.sin(Math.PI * p) }), 1.6),
  ding: (v) => monoOf(synth(1.2, 1318 * v.p, { wave: 'sine', fm: { ratio: 3.5, index: 1.5, decay: 0.2 }, amp: { a: 0.002, d: 1.0, s: 0, r: 0.1 } })),
  success: (v) => sum([tone(0.6, 880 * v.p, { decay: 0.5, type: 'tri' }), 0.5], [tone(0.7, 1318 * v.p, { decay: 0.6, type: 'tri' }), 0.5, 0.09]),
  thud: (v) => sum([tone(0.3, 110 * v.p, { f2: 45 * v.p, decay: 0.28 }), 1], [noise(0.08, { lp: 0.15, decay: 0.06, seed: v.s }), 0.5]),
  boing: (v) => tone(0.45, 190 * v.p, { f2: 420 * v.p, decay: 0.45, vib: 0.25, vibRate: 16, type: 'tri' }),
  boom: (v) => shape(tone(1.4, 72 * v.p, { f2: 32 * v.p, decay: 1.4 }), 3),
  tick: (v) => tone(0.05, 1600 * v.p, { decay: 0.03, type: 'square' }),
  riser: (v) => sum([fnoise(0.9, { seed: v.s, mode: 'bp', fc: (p) => 400 + 7000 * p * p, q: 1.5, decay: 9, attack: 0.6 }), 0.9], [tone(0.9, 200 * v.p, { f2: 900 * v.p, decay: 5, attack: 0.8, type: 'saw' }), 0.1]),
  snap: (v) => sum([noise(0.06, { lp: 0.8, hp: 0.5, decay: 0.03, seed: v.s }), 1], [tone(0.03, 1800 * v.p, { decay: 0.02 }), 0.2]),
  blip: (v) => tone(0.08, 880 * v.p, { decay: 0.07, type: 'square', f2: 990 * v.p }),
  chime: (v) => sum(...[0, 4, 7, 12].map((s, i) => [monoOf(synth(1.0, 1046 * v.p * semi(s), { wave: 'sine', fm: { ratio: 3.5, index: 1.2, decay: 0.2 }, amp: { a: 0.002, d: 0.8, s: 0, r: 0.1 } })), 0.35, i * 0.06])),
  bell: (v) => monoOf(synth(1.8, 660 * v.p, { wave: 'sine', fm: { ratio: 3.5, index: 3, decay: 0.5 }, amp: { a: 0.002, d: 1.6, s: 0, r: 0.1 } })),
  swipe: (v) => gainOf(noise(0.22, { seed: v.s, poles: 2, sweep: (p) => 0.05 + 0.4 * v.p * p }), 1.3),
  drop: (v) => tone(0.4, 900 * v.p, { f2: 140 * v.p, decay: 0.38, type: 'tri' }),
  stamp: (v) => sum([shape(tone(0.25, 90 * v.p, { f2: 50 * v.p, decay: 0.2 }), 2.5), 1], [noise(0.12, { lp: 0.5, decay: 0.08, seed: v.s }), 0.6]),
  pluck: (v) => monoOf(synth(0.5, 523 * v.p, { wave: 'saw', amp: { a: 0.002, d: 0.3, s: 0, r: 0.05 }, cut: 500, cutEnv: 4000, cutDecay: 0.08, res: 1.3 })),
  glitch: (v) => { const r = rng(v.s), out = new Float32Array(Math.ceil(0.25 * SR)); for (let k = 0; k < 6; k++) { const at = Math.round(k * 0.04 * SR), b = tone(0.035, (300 + r() * 2400) * v.p, { decay: 0.03, type: 'square' }); out.set(b.subarray(0, Math.min(b.length, out.length - at)), at); } return gainOf(out, 0.6); },
  bubble: (v) => tone(0.14, 300 * v.p, { f2: 1400 * v.p, decay: 0.12 }),
  tap: (v) => sum([tone(0.06, 1200 * v.p, { decay: 0.04, type: 'tri' }), 0.7], [noise(0.015, { lp: 0.7, decay: 0.01, seed: v.s }), 0.4]),
  zap: (v) => tone(0.22, 2400 * v.p, { f2: 180 * v.p, decay: 0.2, type: 'saw' }),
  shutter: (v) => sum([noise(0.03, { lp: 0.9, hp: 0.4, decay: 0.02, seed: v.s }), 1], [noise(0.04, { lp: 0.9, hp: 0.4, decay: 0.03, seed: v.s + 1 }), 0.8, 0.07]),
  rise: (v) => sum([fnoise(0.45, { seed: v.s, mode: 'bp', fc: (p) => 600 + 6000 * p * p, q: 1.4, decay: 9, attack: 0.3 }), 0.8], [tone(0.45, 300 * v.p, { f2: 1200 * v.p, decay: 5, attack: 0.4, type: 'tri' }), 0.15]),
  fall: (v) => gainOf(noise(0.5, { seed: v.s, poles: 2, sweep: (p) => 0.25 * v.p * (1 - p) + 0.01 }), 1.4),
  impact: (v) => sum([shape(tone(0.9, 55 * v.p, { f2: 30 * v.p, decay: 0.8 }), 2), 1], [fnoise(0.5, { mode: 'lp', fc: 900, decay: 0.12, seed: v.s }), 0.6]),
  coin: (v) => sum([tone(0.09, 988 * v.p, { decay: 0.2, type: 'square' }), 0.4], [tone(0.4, 1319 * v.p, { decay: 0.35, type: 'square' }), 0.4, 0.08]),
  notify: (v) => sum([tone(0.25, 784 * v.p, { decay: 0.2 }), 0.6], [tone(0.4, 1175 * v.p, { decay: 0.35 }), 0.6, 0.11]),
  hit: (v) => sum([tone(0.18, 160 * v.p, { f2: 60 * v.p, decay: 0.15 }), 1], [noise(0.1, { lp: 0.6, hp: 0.3, decay: 0.07, seed: v.s }), 0.7]),
  // ---- pachinko family (2026-10-01): for dopamine level high; check.mjs requires them there ----
  // a ball rattling down through the pins
  pachinko: (v) => balls(1.0, 26, (x) => Math.pow(x, 1.6), v),
  // a stream of balls pouring into the tray
  payout: (v) => sum([balls(1.8, 90, (x) => Math.sin(Math.PI * x / 2) * 0.95, v, 3000), 0.9], [fnoise(1.8, { mode: 'bp', fc: 2600, q: 0.8, decay: 1.2, attack: 0.15, seed: v.s }), 0.25]),
  // "reach": the rising two-tone siren before a big reveal
  reach: (v) => { const out = new Float32Array(Math.ceil(1.2 * SR)); for (let k = 0; k < 15; k++) { const f = (k % 2 ? 1175 : 880) * v.p * semi(k * 0.8), b = tone(0.085, f, { decay: 0.2, type: 'square' }), at = Math.round(k * 0.08 * SR); for (let i = 0; i < b.length && at + i < out.length; i++) out[at + i] += b[i] * (0.25 + 0.55 * k / 14); } return out; },
  // the jackpot: a fast major fanfare, a held bright chord, bells and a payout underneath
  jackpot: (v) => {
    const arp = [0, 4, 7, 12, 16, 19, 24].map((s, i) => [tone(0.12, 523 * v.p * semi(s), { decay: 0.3, type: 'square' }), 0.28, i * 0.055]);
    const chord = [0, 4, 7, 12].map((s) => [tone(0.9, 1046 * v.p * semi(s), { decay: 1.2, type: 'square', vib: 0.01, vibRate: 7, attack: 0.01 }), 0.12, 0.4]);
    const bells = [0.4, 0.75, 1.1].map((at) => [SFX.bell({ p: v.p * 1.5, s: v.s }), 0.3, at]);
    return sum(...arp, ...chord, ...bells, [SFX.payout({ p: v.p, s: v.s + 7 }), 0.45, 0.35]);
  },
  // "fever": a flurry of bright notes, the machine in bonus mode
  fever: (v) => { const r = rng(v.s), parts = []; const pent = [0, 2, 4, 7, 9, 12, 14, 16]; for (let k = 0; k < 18; k++) parts.push([tone(0.09, 1046 * v.p * semi(pent[Math.floor(r() * pent.length)]), { decay: 0.12, type: k % 3 ? 'tri' : 'square' }), 0.3, k * 0.055]); return sum(...parts, [balls(1.1, 30, (x) => x, v, 3800), 0.6]); },
};
export const PACHINKO = ['pachinko', 'payout', 'reach', 'jackpot', 'fever'];
// 'type' is a burst of key clicks: MR.cue(t, 'type', { dur: 1.2, cps: 14 })
// 'sting' is a short sonic logo built from this video's own melody and key; put it where the logo lands.
export const CUE_NAMES = [...Object.keys(SFX), 'type', 'sting'];

// ---------- music: eight base styles, every track crafted from a seed ----------
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10] };
const PROGS = {
  major: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 4, 0, 0], [0, 3, 5, 4], [5, 3, 0, 4], [0, 2, 3, 4], [3, 0, 4, 5], [0, 4, 3, 3]],
  minor: [[0, 5, 2, 6], [0, 3, 4, 0], [0, 6, 5, 6], [0, 3, 6, 4], [5, 6, 0, 0], [0, 2, 3, 4]],
  dorian: [[0, 3, 0, 3], [0, 6, 3, 0], [0, 1, 3, 4]],
  mixo: [[0, 6, 3, 0], [0, 4, 6, 3], [6, 3, 0, 0]],
};
function chordOf(scale, deg, root, seventh, inversion) {
  const at = (k) => { const i = deg + k; return root + scale[i % 7] + 12 * Math.floor(i / 7); };
  const notes = seventh ? [at(0), at(2), at(4), at(6)] : [at(0), at(2), at(4)];
  for (let i = 0; i < inversion; i++) notes.push(notes.shift() + 12);
  return { bass: at(0), notes };
}

// instruments; V = this track's variation (brightness, detune)
const INS = (V) => ({
  pluck: (n, d) => synth(d + 0.3, midi(n), { wave: 'saw', voices: 2, detune: 7 * V.det, spread: 0.4, amp: { a: 0.002, d: 0.35, s: 0, r: 0.1 }, cut: 380 * V.b, cutEnv: 4200 * V.b, cutDecay: 0.11, res: 1.3 }),
  pad: (n, d) => synth(d, midi(n), { wave: 'saw', voices: 5, detune: 14 * V.det, spread: 0.85, amp: { a: 0.35, d: 1, s: 0.85, r: 0.5 }, cut: 1300 * V.b, cutEnv: 700, cutDecay: 1.0, res: 0.8 }),
  strings: (n, d) => synth(d, midi(n), { wave: 'saw', voices: 4, detune: 9 * V.det, spread: 0.7, amp: { a: 0.7, d: 1, s: 0.9, r: 0.9 }, cut: 900 * V.b, res: 0.7, vib: 0.003 }),
  keys: (n, d) => synth(d + 0.4, midi(n), { wave: 'sine', fm: { ratio: 1, index: 2.0 * V.b, decay: 0.3 }, amp: { a: 0.003, d: 1.2, s: 0.2, r: 0.3 } }),
  marimba: (n) => synth(0.6, midi(n), { wave: 'sine', fm: { ratio: 3.99, index: 1.3, decay: 0.05 }, amp: { a: 0.002, d: 0.35, s: 0, r: 0.05 } }),
  bell: (n) => synth(1.4, midi(n), { wave: 'sine', fm: { ratio: 3.5, index: 2.6, decay: 0.4 }, amp: { a: 0.002, d: 1.2, s: 0, r: 0.1 } }),
  lead: (n, d) => synth(d + 0.1, midi(n), { wave: 'square', voices: 2, detune: 6 * V.det, spread: 0.2, amp: { a: 0.01, d: 0.4, s: 0.6, r: 0.08 }, cut: 1800 * V.b, cutEnv: 2400, cutDecay: 0.15, res: 1.0, vib: 0.006, vibRate: 5.5 }),
  bassSub: (n, d) => synth(d, midi(n), { wave: 'sine', amp: { a: 0.005, d: 0.5, s: 0.8, r: 0.05 }, drive: 1.6 }),
  bassPluck: (n, d) => synth(d, midi(n), { wave: 'saw', amp: { a: 0.003, d: 0.25, s: 0.5, r: 0.04 }, cut: 200 * V.b, cutEnv: 1500 * V.b, cutDecay: 0.09, res: 1.6, drive: 1.3 }),
  bassReese: (n, d) => synth(d, midi(n), { wave: 'saw', voices: 2, detune: 14 * V.det, spread: 0.15, amp: { a: 0.005, d: 0.4, s: 0.8, r: 0.05 }, cut: 480 * V.b, cutEnv: 600, cutDecay: 0.18, res: 1.0, drive: 1.4 }),
  bassRound: (n, d) => synth(d, midi(n), { wave: 'tri', amp: { a: 0.004, d: 0.3, s: 0.6, r: 0.04 }, cut: 900, res: 0.7 }),
});
const KIT = (V) => {
  const kickN = Math.ceil(0.45 * SR), kick = new Float32Array(kickN); let ph = 0;
  for (let i = 0; i < kickN; i++) { const t = i / SR, f = V.kf + 120 * Math.exp(-t / 0.03); ph += f / SR; kick[i] = Math.tanh(1.8 * Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.32)); }
  const click = fnoise(0.006, { mode: 'hp', fc: 3000, decay: 0.002, seed: 5 });
  for (let i = 0; i < click.length; i++) kick[i] += click[i] * 0.5;
  return {
    kick,
    softKick: gainOf(kick, 0.55),
    snare: sum([tone(0.2, 185 * V.st, { decay: 0.12 }), 0.6], [fnoise(0.25, { mode: 'bp', fc: 2200, q: 0.8, decay: 0.07, seed: 51 }), 1.4]),
    clap: sum(...[0, 0.011, 0.022].map((o, i) => [fnoise(0.03, { mode: 'bp', fc: 1150, q: 1.2, decay: 0.008, seed: 31 + i }), 1.2, o]), [fnoise(0.2, { mode: 'bp', fc: 1150, q: 1.0, decay: 0.06, seed: 34 }), 1.0, 0.03]),
    rim: sum([tone(0.04, 1700 * V.st, { decay: 0.025, type: 'square' }), 0.25], [fnoise(0.03, { mode: 'bp', fc: 3200, q: 2, decay: 0.008, seed: 61 }), 1]),
    hat: gainOf(metallic(0.08, 0.035, V.ht), 3),
    openHat: gainOf(metallic(0.4, 0.15, V.ht), 3),
    shaker: fnoise(0.09, { mode: 'hp', fc: 6000, decay: 0.03, attack: 0.012, seed: 71 }),
    crash: sum([gainOf(metallic(1.8, 0.7, V.ht * 1.4), 2), 1], [fnoise(1.8, { mode: 'hp', fc: 5000, decay: 0.6, seed: 81 }), 0.5]),
    tom: (f) => tone(0.5, f, { f2: f * 0.6, decay: 0.45 }),
  };
};

// Base styles. Drum rows are 16 steps per bar: K kick, S snare/clap, H hat, O open hat, B bass rhythm.
// sc: sidechain duck depth; verb: reverb send; delay: echo on arp and lead; stabs: chord hits in beats.
const STYLES = {
  bright: { bpm: 118, scale: 'major', bass: 'bassPluck', chord: 'pluck', arp: 'pluck', lead: 'bell', snare: 'clap', swing: 0, sc: 0.3, verb: 0.22, delay: 0.18, stabs: [0, 1.5, 2.5],
    drums: [{ K: 'x...x...x...x...', S: '....x.......x...', H: '..x...x...x...x.', B: 'x.....x.x.....x.' }, { K: 'x..x..x.x...x...', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.', B: 'x..x..x...x..x..' }] },
  calm: { bpm: 88, scale: 'major', bass: 'bassSub', chord: 'pad', arp: 'keys', lead: 'bell', snare: 'rim', swing: 0, sc: 0, verb: 0.4, delay: 0.2, sparse: true, perc: 'shaker',
    drums: [{ K: '................', S: '................', H: '..x...x...x...x.', B: 'x...............' }, { K: 'x.......x.......', S: '............x...', H: '....x.......x...', B: 'x.......x.......' }] },
  pulse: { bpm: 124, scale: 'minor', bass: 'bassReese', chord: 'pad', arp: 'pluck', lead: 'lead', snare: 'clap', swing: 0, sc: 0.55, verb: 0.25, delay: 0.22,
    drums: [{ K: 'x...x...x...x...', S: '....x.......x...', H: '..x...x...x...x.', O: '..x...x...x...x.', B: '..x...x...x...x.' }, { K: 'x...x...x...x...', S: '....x.......x..x', H: 'xxxxxxxxxxxxxxxx', B: '..xx..x...xx..x.' }] },
  groove: { bpm: 108, scale: 'dorian', bass: 'bassPluck', chord: 'keys', arp: 'keys', lead: 'lead', snare: 'snare', swing: 0.14, sc: 0.2, verb: 0.2, delay: 0.12, stabs: [0, 0.75, 2, 2.75],
    drums: [{ K: 'x.....x...x.....', S: '....x..x....x...', H: 'x.xxx.xxx.xxx.xx', B: 'x..x..x.x.x..x..' }, { K: 'x..x......x..x..', S: '....x.......x.x.', H: 'x.x.x.x.x.x.x.x.', B: 'x.xx...x.x..x...' }] },
  lofi: { bpm: 82, scale: 'major', seventh: true, bass: 'bassSub', chord: 'keys', arp: 'keys', lead: 'bell', snare: 'rim', swing: 0.22, sc: 0.15, verb: 0.35, delay: 0.15, stabs: [0, 2.5], dark: 6500,
    drums: [{ K: 'x......x..x.....', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.', B: 'x.........x.....' }, { K: 'x.....x.........', S: '....x.......x...', H: 'x.xxx.x.x.xxx.x.', B: 'x.....x...x.....' }] },
  cinematic: { bpm: 96, scale: 'minor', bass: 'bassSub', chord: 'strings', arp: 'bell', lead: 'bell', snare: 'snare', swing: 0, sc: 0, verb: 0.5, delay: 0.25, toms: true,
    drums: [{ K: 'x.......x..x....', S: '................', H: '................', B: 'x.......x.......' }, { K: 'x..x....x..x....', S: '............x...', H: '..x...x...x...x.', B: 'x.......x...x...' }] },
  playful: { bpm: 114, scale: 'mixo', bass: 'bassRound', chord: 'marimba', arp: 'marimba', lead: 'bell', snare: 'rim', swing: 0.08, sc: 0.1, verb: 0.22, delay: 0.15, stabs: [0, 1, 2, 3], perc: 'shaker',
    drums: [{ K: 'x.......x.......', S: '....x.......x...', H: '..x...x...x...x.', B: 'x...x.x.x...x.x.' }, { K: 'x.....x.x.......', S: '....x..x....x...', H: 'x.x.x.x.x.x.x.x.', B: 'x..x....x..x.x..' }] },
  bold: { bpm: 128, scale: 'major', bass: 'bassReese', chord: 'pad', arp: 'lead', lead: 'lead', snare: 'clap', swing: 0, sc: 0.5, verb: 0.22, delay: 0.2,
    drums: [{ K: 'x...x...x...x...', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.', O: '..x...x...x...x.', B: 'x.x.x.x.x.x.x.x.' }, { K: 'x...x...x..xx...', S: '....x.......x...', H: 'xxxxxxxxxxxxxxxx', B: 'x..x..x.x..x..x.' }] },
};
export const MUSIC = STYLES;

// Crafts this video's track from its base style: what the seed changes.
export function planMusic(sound, name) {
  const style = sound.music || 'none';
  if (style === 'none') return null;
  const S = STYLES[style];
  if (!S) throw new Error(`Unknown music style "${style}". Use one of: none, ${Object.keys(STYLES).join(', ')}`);
  const seed = sound.seed ?? hash(name || 'video');
  const r = rng(seed);
  const pool = PROGS[S.scale];
  const plan = {
    style, seed,
    bpm: sound.bpm || Math.round(S.bpm * (0.93 + 0.14 * r())),      // tempo: about ±7% around the style
    key: sound.key ?? Math.floor(r() * 12),                          // pitch: any of 12 keys
    prog: pool[Math.floor(r() * pool.length)],
    inversion: Math.floor(r() * 3),
    drums: Math.floor(r() * S.drums.length),
    arpShape: [[0, 1, 2, 1], [0, 2, 1, 2], [2, 1, 0, 1], [0, 1, 2, 3], [0, 0, 2, 1], [1, 2, 0, 2]][Math.floor(r() * 6)],
    motif: Array.from({ length: 8 }, () => (r() < 0.25 ? null : Math.floor(r() * 5))),
    swing: Math.max(0, S.swing + (r() - 0.5) * 0.08),
    bright: 0.75 + r() * 0.55,                                      // filter brightness
    detune: 0.7 + r() * 0.7,
    room: 0.78 + r() * 0.12,
    kick: 40 + r() * 16, snareTune: 0.9 + r() * 0.2, hatTune: 0.9 + r() * 0.25,
  };
  plan.signature = `${style}|${plan.bpm}|${plan.key}|${plan.prog.join('')}|${plan.inversion}|${plan.drums}|${plan.arpShape.join('')}|${plan.motif.map((m) => (m === null ? '-' : m)).join('')}`;
  return plan;
}

// energy: [[time, level]] with level 0 (bass and chords only) .. 3 (everything, plus the melody on top).
function energyAt(energy, t) { let e = energy[0][1]; for (const [at, lv] of energy) if (t >= at) e = lv; return e; }
const PENTA = [0, 2, 4, 7, 9];

function renderMusic(n, dur, plan, sound) {
  const S = STYLES[plan.style], beat = 60 / plan.bpm, step = beat / 4, bar = beat * 4;
  const V = { b: plan.bright, det: plan.detune, kf: plan.kick, st: plan.snareTune, ht: plan.hatTune };
  const ins = INS(V), kit = KIT(V);
  const scale = SCALES[S.scale], root = 48 + ((plan.key + 6) % 12) - 6;
  const pat = S.drums[plan.drums];
  const energy = sound.energy || [[0, S.sparse ? 1 : 2], [Math.max(0, dur - 2.5), 1]];
  const drums = stereo(n), bass = stereo(n), music = stereo(n), verbSend = stereo(n), delaySend = stereo(n);
  const kicks = [];
  let lastE = energyAt(energy, 0);
  for (let b = 0; b * bar < dur; b++) {
    const { bass: bn, notes: ch } = chordOf(scale, plan.prog[b % plan.prog.length], root, !!S.seventh, plan.inversion);
    for (let s = 0; s < 16; s++) {
      const t = b * bar + s * step + (s % 2 ? plan.swing * step : 0);
      if (t >= dur) break;
      const e = energyAt(energy, t);
      if (e > lastE) { mix(drums, kit.crash, t, 0.22 * (e - lastE), 0.2); mix(verbSend, kit.crash, t, 0.3); }
      lastE = e;
      const hum = 0.9 + 0.1 * Math.sin(b * 7 + s * 3); // small velocity movement, so loops breathe
      if (e >= 1 && pat.K[s] === 'x') { mix(drums, S.sparse ? kit.softKick : kit.kick, t, 0.95); kicks.push(t); }
      if (e >= 2 && pat.S[s] === 'x') { mix(drums, kit[S.snare], t, 0.5 * hum, -0.08); mix(verbSend, kit[S.snare], t, 0.25); }
      if (b % 4 === 3 && s >= 12 && e >= 2 && s % 2 === 1) mix(drums, kit[S.snare], t, 0.22, 0.15);
      if (e >= 1 && pat.H[s] === 'x') mix(drums, kit.hat, t, (e >= 3 ? 0.3 : 0.22) * hum * (s % 4 === 2 ? 1 : 0.75), 0.25);
      if (e >= 3 && pat.O && pat.O[s] === 'x') mix(drums, kit.openHat, t, 0.16, -0.25);
      if (S.perc && e >= 1 && s % 2 === 1) mix(drums, kit.shaker, t, 0.18 * hum, -0.3);
      if (S.toms && e >= 2 && b % 2 === 1 && (s === 12 || s === 14)) { const tm = kit.tom(midi(root - 12 + (s === 12 ? 7 : 0))); mix(drums, tm, t, 0.55); mix(verbSend, tm, t, 0.4); }
      if (pat.B[s] === 'x') { const next = pat.B.slice(s + 1).indexOf('x'), len = Math.min((next < 0 ? 16 - s : next + 1) * step, beat * 2) * 0.95; mix(bass, ins[S.bass](bn - 12, len), t, 0.5); }
      if (e >= 2 && s % 2 === 0) {
        const note = ch[plan.arpShape[(s / 2) % plan.arpShape.length] % ch.length] + 12, a = ins[S.arp](note, step * 1.8);
        mix(music, a, t, 0.13, s % 4 ? 0.3 : -0.3); mix(delaySend, a, t, S.delay); mix(verbSend, a, t, S.verb * 0.5);
      }
      if (e >= 3 && s % 2 === 0) {
        const m = plan.motif[(s / 2) % 8];
        if (m !== null) { const l = ins[S.lead](root + 24 + PENTA[m], step * 1.9); mix(music, l, t, 0.09, 0.1); mix(delaySend, l, t, S.delay * 1.2); mix(verbSend, l, t, S.verb * 0.6); }
      }
    }
    if (S.chord === 'pad' || S.chord === 'strings') {
      ch.forEach((nn) => { const p = ins[S.chord](nn + 12, bar * 1.05); mix(music, p, b * bar, 0.085); mix(verbSend, p, b * bar, S.verb); });
    } else {
      for (const at of S.stabs || [0, 1.5, 2.5]) {
        const t = b * bar + at * beat; if (t >= dur) continue;
        ch.forEach((nn) => { const c = ins[S.chord](nn + 12, beat * 0.8); mix(music, c, t, 0.075); mix(verbSend, c, t, S.verb * 0.7); });
      }
    }
  }
  // sidechain: bass and chords duck under every kick, the pumping that makes dance music feel alive
  if (S.sc) {
    let ki = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR; while (ki + 1 < kicks.length && kicks[ki + 1] <= t) ki++;
      const dt = kicks.length && kicks[ki] <= t ? t - kicks[ki] : 9;
      const g = 1 - S.sc * Math.exp(-dt / 0.13) * Math.min(1, dt / 0.004 + 0.2);
      bass.L[i] *= g; bass.R[i] *= g; music.L[i] *= g; music.R[i] *= g;
    }
  }
  const wet = reverb(verbSend, plan.room, 0.3), echo = pingpong(delaySend, beat * 0.75, 0.38);
  const out = stereo(n);
  for (let i = 0; i < n; i++) {
    out.L[i] = drums.L[i] + bass.L[i] * 0.85 + music.L[i] + wet.L[i] * 0.9 + echo.L[i] * 0.5;
    out.R[i] = drums.R[i] + bass.R[i] * 0.85 + music.R[i] + wet.R[i] * 0.9 + echo.R[i] * 0.5;
  }
  if (S.dark) { const fl = new SVF(), fr = new SVF(); for (let i = 0; i < n; i++) { out.L[i] = fl.run(out.L[i], S.dark, 0.6, 'lp'); out.R[i] = fr.run(out.R[i], S.dark, 0.6, 'lp'); } }
  return out;
}

// the sting: this track's own sonic logo, the melody's first notes resolving on the tonic chord
function sting(plan) {
  const root = plan ? 60 + ((plan.key + 6) % 12) - 6 : 60, motif = plan ? plan.motif.filter((m) => m !== null).slice(0, 3) : [2, 4, 1];
  const ins = INS({ b: 1, det: 1 }), out = stereo(Math.ceil(2.2 * SR));
  motif.forEach((m, i) => mix(out, ins.bell(root + 12 + PENTA[m]), i * 0.12, 0.35));
  const at = motif.length * 0.12;
  [0, 4, 7, 12].forEach((s) => { mix(out, ins.bell(root + s + 12), at, 0.25); mix(out, ins.pluck(root + s, 0.6), at, 0.25); });
  const wet = reverb(out, 0.85, 0.3);
  for (let i = 0; i < out.L.length; i++) { out.L[i] += wet.L[i] * 0.8; out.R[i] += wet.R[i] * 0.8; }
  return out;
}

// master bus: low cut, compressor, soft limiter, -1 dB peak
function master(L, R) {
  const n = L.length, hl = new SVF(), hr = new SVF();
  let peak = 0;
  for (let i = 0; i < n; i++) { L[i] = hl.run(L[i], 30, 0.7, 'hp'); R[i] = hr.run(R[i], 30, 0.7, 'hp'); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  if (!peak) return 0;
  const th = 0.35, ratio = 3, atk = Math.exp(-1 / (0.005 * SR)), rel = Math.exp(-1 / (0.15 * SR));
  let env = 0, peak2 = 0;
  for (let i = 0; i < n; i++) {
    const l = L[i] / peak, r = R[i] / peak, x = Math.max(Math.abs(l), Math.abs(r));
    env = x > env ? atk * env + (1 - atk) * x : rel * env + (1 - rel) * x;
    const g = env > th ? Math.pow(env / th, 1 / ratio - 1) : 1;
    L[i] = Math.tanh(l * g * 1.6); R[i] = Math.tanh(r * g * 1.6);
    peak2 = Math.max(peak2, Math.abs(L[i]), Math.abs(R[i]));
  }
  for (let i = 0; i < n; i++) { L[i] *= 0.89 / peak2; R[i] *= 0.89 / peak2; }
  return peak;
}

// ---------- the track ----------
export function buildAudio(meta, outFile, { musicOff = false } = {}) {
  const sound = meta.sound || {};
  const dur = meta.duration + 0.2, n = Math.ceil(dur * SR);
  const plan = musicOff ? null : planMusic(sound, meta.name);
  const musicBus = plan ? renderMusic(n, dur, plan, sound) : stereo(n);
  const fx = stereo(n), fxVerb = stereo(n);
  const base = sound.seed ?? hash(meta.name || 'video');
  const r = rng(base ^ 99), seen = {};
  for (const c of meta.cues || []) {
    if (!CUE_NAMES.includes(c.name)) throw new Error(`Unknown sound cue "${c.name}" at ${c.t}s. Use one of: ${CUE_NAMES.join(', ')}`);
    const gain = c.gain ?? 1;
    if (c.name === 'type') { const cps = c.cps || 14; for (let t = 0; t < (c.dur || 1); t += 1 / cps) mix(fx, tone(0.03, 1400 + r() * 900, { decay: 0.02, type: 'square' }), c.t + t, 0.18 * gain, r() - 0.5); continue; }
    if (c.name === 'sting') { const s = sting(plan); mix(fx, s, c.t, 0.9 * gain); continue; }
    const h = hash(c.name + base), k = (seen[c.name] = (seen[c.name] || 0) + 1);
    const p = semi(((h % 7) - 3) * 0.7 + (c.pitch || 0) + ((k * 5) % 3 - 1) * 0.35);
    const snd = SFX[c.name]({ p, s: (h + k) % 100000 });
    mix(fx, snd, c.t, 0.8 * gain, c.pan || 0);
    mix(fxVerb, snd, c.t, 0.25 * gain);
  }
  const fxWet = reverb(fxVerb, 0.75, 0.35);
  // music sits under the effects; fade the end so the loop point is clean
  const mv = sound.musicVolume ?? 0.55, fv = sound.sfxVolume ?? 1;
  const L = new Float32Array(n), R = new Float32Array(n);
  const fadeFrom = (meta.duration - 1.2) * SR;
  // music level is set against the effects before mastering
  let mp = 0; for (let i = 0; i < n; i++) mp = Math.max(mp, Math.abs(musicBus.L[i]), Math.abs(musicBus.R[i]));
  const mnorm = mp ? 1 / mp : 1;
  let fp = 0; for (let i = 0; i < n; i++) fp = Math.max(fp, Math.abs(fx.L[i]), Math.abs(fx.R[i]));
  const fnorm = fp ? 1 / fp : 1;
  for (let i = 0; i < n; i++) {
    const f = i > fadeFrom ? Math.max(0, 1 - (i - fadeFrom) / (1.2 * SR)) : 1;
    L[i] = musicBus.L[i] * mnorm * mv * f + (fx.L[i] + fxWet.L[i] * 0.6) * fnorm * fv;
    R[i] = musicBus.R[i] * mnorm * mv * f + (fx.R[i] + fxWet.R[i] * 0.6) * fnorm * fv;
  }
  const peak = master(L, R);
  const data = Buffer.alloc(44 + n * 4);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 4, 4); data.write('WAVE', 8); data.write('fmt ', 12);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); }
  fs.writeFileSync(outFile, data);
  return { file: outFile, cues: (meta.cues || []).length, music: musicOff ? 'user file' : plan ? plan.style : 'none', plan, peak };
}
