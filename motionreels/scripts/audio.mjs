// Generates the soundtrack from code: a music bed and sound effects, all synthesised here,
// so no third-party recording is ever used and nothing needs a licence.
// The page declares it:  MR.config({ sound: { music: 'bright', bpm: 120 } })  and  MR.cue(1.2, 'pop')
// Usage (render.mjs calls this):  buildAudio(meta, 'out/sound.wav')
import fs from 'node:fs';

const SR = 44100;

// ---------- building blocks ----------
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
function tone(sec, f, { type = 'sine', decay = sec, attack = 0.004, f2 = null, vib = 0, vibRate = 0 } = {}) {
  const n = Math.ceil(sec * SR), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, p = t / sec;
    const fr = (f2 === null ? f : f * Math.pow(f2 / f, p)) * (1 + vib * Math.sin(2 * Math.PI * vibRate * t) * (1 - p));
    ph += (2 * Math.PI * fr) / SR;
    const x = ph / (2 * Math.PI) % 1;
    const w = type === 'sine' ? Math.sin(ph) : type === 'tri' ? 1 - 4 * Math.abs(x - 0.5) : type === 'saw' ? 2 * x - 1 : x < 0.5 ? 1 : -1;
    const env = Math.min(1, t / attack) * Math.exp(-t / (decay / 5));
    out[i] = w * env;
  }
  return out;
}
function noise(sec, { decay = sec, seed = 1, lp = 1, hp = 0, sweep = null, poles = 1 } = {}) {
  const n = Math.ceil(sec * SR), out = new Float32Array(n), r = rng(seed);
  let low = 0, low2 = 0, prevIn = 0, high = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, p = t / sec;
    const a = sweep ? sweep(p) : lp;
    const x = r() * 2 - 1;
    low += a * (x - low);
    low2 += a * (low - low2);
    const lo = poles > 1 ? low2 : low;
    high = hp ? hp * (high + lo - prevIn) : lo; prevIn = lo;
    const env = sweep ? Math.sin(Math.PI * p) : Math.exp(-t / (decay / 5));
    out[i] = high * env;
  }
  return out;
}
const mixInto = (dst, src, at, gain = 1, pan = 0) => {
  const start = Math.round(at * SR), gl = gain * Math.min(1, 1 - pan), gr = gain * Math.min(1, 1 + pan);
  for (let i = 0; i < src.length; i++) { const j = start + i; if (j < 0 || j >= dst[0].length) continue; dst[0][j] += src[i] * gl; dst[1][j] += src[i] * gr; }
};
const sum = (...parts) => { const n = Math.max(...parts.map(([b]) => b.length)), out = new Float32Array(n); for (const [b, g, off = 0] of parts) { const o = Math.round(off * SR); for (let i = 0; i < b.length && i + o < n; i++) out[i + o] += b[i] * g; } return out; };

// ---------- sound effects (names are the public contract; check.mjs validates them) ----------
export const SFX = {
  pop: () => tone(0.12, 520, { f2: 1250, decay: 0.1 }),
  click: () => sum([noise(0.02, { lp: 0.9, hp: 0.6, decay: 0.012, seed: 3 }), 0.8], [tone(0.02, 2200, { decay: 0.012 }), 0.3]),
  // Air moving, not a hiss: two-pole filtered noise that opens only a little and swells smoothly.
  whoosh: () => noise(0.45, { seed: 7, poles: 2, sweep: (p) => 0.015 + 0.13 * Math.sin(Math.PI * p) }).map((v) => v * 1.6),
  swoosh: () => noise(0.3, { seed: 11, poles: 2, sweep: (p) => 0.02 + 0.16 * Math.sin(Math.PI * p) }).map((v) => v * 1.6),
  ding: () => sum([tone(1.0, 1318, { decay: 0.9 }), 0.6], [tone(1.0, 1976, { decay: 0.6 }), 0.3], [tone(1.0, 2637, { decay: 0.4 }), 0.12]),
  success: () => sum([tone(0.6, 880, { decay: 0.5, type: 'tri' }), 0.5], [tone(0.7, 1318, { decay: 0.6, type: 'tri' }), 0.5, 0.09]),
  thud: () => sum([tone(0.3, 110, { f2: 45, decay: 0.28 }), 1], [noise(0.08, { lp: 0.15, decay: 0.06, seed: 5 }), 0.5]),
  boing: () => tone(0.45, 190, { f2: 420, decay: 0.45, vib: 0.25, vibRate: 16, type: 'tri' }),
  boom: () => { const b = tone(1.4, 72, { f2: 32, decay: 1.4 }); for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * 3) * 0.8; return b; },
  tick: () => tone(0.05, 1600, { decay: 0.03, type: 'square' }),
  riser: () => { const n = noise(0.9, { seed: 13, sweep: (p) => 0.02 + 0.6 * p * p }); const t = tone(0.9, 200, { f2: 900, decay: 5, attack: 0.8, type: 'saw' }); return sum([n, 0.5], [t, 0.12]); },
};
// 'type' is a burst of key clicks: MR.cue(t, 'type', { dur: 1.2, cps: 14 })
export const CUE_NAMES = [...Object.keys(SFX), 'type'];

// ---------- music beds (generated, original) ----------
const PROG = [[48, 52, 55, 60], [43, 47, 50, 55], [45, 48, 52, 57], [41, 45, 48, 53]]; // C, G, Am, F
export const MUSIC = {
  bright(buf, dur, bpm) {
    const beat = 60 / bpm, bar = beat * 4;
    const kick = sum([tone(0.35, 150, { f2: 45, decay: 0.3 }), 1]), hat = noise(0.06, { lp: 1, hp: 0.85, decay: 0.04, seed: 21 });
    const clap = sum([noise(0.15, { lp: 0.6, hp: 0.3, decay: 0.12, seed: 31 }), 0.7], [noise(0.15, { lp: 0.6, hp: 0.3, decay: 0.1, seed: 32 }), 0.5, 0.012], [noise(0.15, { lp: 0.6, hp: 0.3, decay: 0.1, seed: 33 }), 0.4, 0.024]);
    for (let t = 0, b = 0; t < dur; t += beat, b++) {
      mixInto(buf, kick, t, 0.9);
      mixInto(buf, hat, t + beat / 2, 0.25, 0.3);
      if (b % 2 === 1) mixInto(buf, clap, t, 0.45, -0.1);
      const ch = PROG[Math.floor(t / bar) % 4];
      mixInto(buf, tone(beat * 0.9, midi(ch[0] - 12), { decay: beat * 0.8, type: 'tri' }), t, 0.5);
      for (let s = 0; s < 4; s++) mixInto(buf, tone(0.18, midi(ch[(b * 4 + s) % 4] + 12), { decay: 0.15, type: 'tri' }), t + (s * beat) / 4, 0.12, s % 2 ? 0.25 : -0.25);
    }
  },
  calm(buf, dur, bpm) {
    const beat = 60 / bpm, bar = beat * 4;
    for (let t = 0; t < dur; t += bar) {
      const ch = PROG[Math.floor(t / bar) % 4];
      ch.forEach((n, i) => mixInto(buf, tone(bar * 1.1, midi(n + 12), { decay: bar * 3, attack: 0.25 }), t, 0.09, i % 2 ? 0.3 : -0.3));
      mixInto(buf, tone(bar, midi(ch[0] - 12), { decay: bar * 2, attack: 0.1 }), t, 0.25);
    }
    const hat = noise(0.05, { lp: 1, hp: 0.9, decay: 0.03, seed: 41 });
    for (let t = beat / 2; t < dur; t += beat) mixInto(buf, hat, t, 0.08, 0.2);
  },
};

// ---------- the track ----------
export function buildAudio(meta, outFile, { musicOff = false } = {}) {
  const sound = meta.sound || {};
  const dur = meta.duration + 0.2, n = Math.ceil(dur * SR);
  const music = [new Float32Array(n), new Float32Array(n)], fx = [new Float32Array(n), new Float32Array(n)];
  const style = sound.music || 'none';
  if (!musicOff && style !== 'none') {
    if (!MUSIC[style]) throw new Error(`Unknown music style "${style}". Use one of: none, ${Object.keys(MUSIC).join(', ')}`);
    MUSIC[style](music, dur, sound.bpm || 120);
  }
  const r = rng(99);
  for (const c of meta.cues || []) {
    if (!CUE_NAMES.includes(c.name)) throw new Error(`Unknown sound cue "${c.name}" at ${c.t}s. Use one of: ${CUE_NAMES.join(', ')}`);
    const gain = c.gain ?? 1;
    if (c.name === 'type') { const cps = c.cps || 14; for (let t = 0; t < (c.dur || 1); t += 1 / cps) mixInto(fx, tone(0.03, 1400 + r() * 900, { decay: 0.02, type: 'square' }), c.t + t, 0.18 * gain, r() - 0.5); }
    else mixInto(fx, SFX[c.name](), c.t, 0.8 * gain, c.pan || 0);
  }
  // music sits under the effects; fade the end so the loop point is clean
  const mv = sound.musicVolume ?? 0.55, fv = sound.sfxVolume ?? 1;
  const L = new Float32Array(n), R = new Float32Array(n);
  const fadeFrom = (meta.duration - 1.2) * SR;
  for (let i = 0; i < n; i++) {
    const f = i > fadeFrom ? Math.max(0, 1 - (i - fadeFrom) / (1.2 * SR)) : 1;
    L[i] = music[0][i] * mv * f + fx[0][i] * fv;
    R[i] = music[1][i] * mv * f + fx[1][i] * fv;
  }
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const norm = peak > 0 ? 0.89 / peak : 1;
  const data = Buffer.alloc(44 + n * 4);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 4, 4); data.write('WAVE', 8); data.write('fmt ', 12);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { data.writeInt16LE(Math.round(L[i] * norm * 32767), 44 + i * 4); data.writeInt16LE(Math.round(R[i] * norm * 32767), 46 + i * 4); }
  fs.writeFileSync(outFile, data);
  return { file: outFile, cues: (meta.cues || []).length, music: musicOff ? 'user file' : style, peak };
}
