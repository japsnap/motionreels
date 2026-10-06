// The slop gate. Reads the video page three ways and fails loudly on anything banned:
//   1. the source: blur, 3D flips, particles, glow, CSS animation, randomness, stock media,
//      CSS written after </style>
//   2. the rendered frames: nothing moving at frame 0, a flat first frame, any hold over
//      about a second, text that is too long, too small, or sits under the platform's buttons,
//      and, while the layout is at rest, glyphs cut by a clip, text running out of its card,
//      or two text blocks overlapping
//   3. the soundtrack: a 400 ms moment more than 6 LU louder than the whole track
// Usage: node check.mjs <video-folder> [--lang ja] [--audio music.mp3] [--json]
// Exit code 0 = passed, 1 = failed. render.mjs runs this first. scripts/test-check.mjs tests it.
// 2026-10-04: the at-rest text checks, the loudness check and the CSS check were added from the
// owner's review lessons of a multi-language series, his words: "This is a motionreel skill learning.
// Read this and update the skill appropriately. Do not bloat it."
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import ffmpegPath from 'ffmpeg-static';
import { parseArgs, resolvePage, openPage, seek, shot, userMix } from './lib.mjs';
import { CUE_NAMES, MUSIC, PACHINKO, buildAudio } from './audio.mjs';

const SAMPLE_STEP = 0.1;      // seconds between sampled frames
const STILL_DIFF = 0.25;      // mean pixel change (0-255) below which two samples count as still
const MAX_HOLD = { calm: 1.6, low: 1.6, medium: 1.2, high: 0.8 }; // longest still stretch mid-video, by intensity (the dopamine level; low = calm)
const START_WINDOW = 0.3;     // something must visibly move within this many seconds of frame 0
const MIN_TEXT_RATIO = 0.04;  // smallest readable text as a share of the frame width
const INK_TOL = 1;            // px of ink past a clip, a card or another text that still counts as touching
const AT_REST = 2;            // a text fault counts once its geometry holds for this many samples in a row
const MAX_SPIKE_LU = 6;       // a 400 ms moment may be at most this much louder than the whole track
// Seconds a line must be on screen to be read: 0.5 s plus 0.22 s a word (Latin) or 0.12 s a character (CJK).
const readNeed = (s) => { const cjk = (s.match(/[぀-ヿ㐀-鿿가-힯]/g) || []).length; return cjk ? 0.5 + cjk * 0.12 : 0.5 + s.split(/\s+/).filter(Boolean).length * 0.22; };

const BANS = [
  { re: /blur\(/i, skip: /backdrop/i, why: 'blur (blur-ins and soft focus read as template slop)' },
  { re: /rotate[XY]\s*\(|rotate3d\s*\(|perspective\s*[:(]/i, why: '3D rotation or perspective (3D flips are banned)' },
  { re: /particle|confetti|sparkle|firework/i, why: 'particles, confetti or sparkles' },
  { re: /(text|box)-shadow\s*:[^;"]*\b0(px)?\s+0(px)?\s+[2-9]\d+px/i, why: 'glow (a shadow with no offset and a large spread)' },
  { re: /@keyframes|\banimation\s*:|\btransition\s*:/i, why: 'CSS animation or transition (motion must come from MR.update so every frame renders the same)' },
  { re: /Math\.random\s*\(/, why: 'Math.random (frames must be identical on every render)' },
  { re: /setTimeout|setInterval|requestAnimationFrame/, why: 'timers (motion must come from MR.update, driven by time)' },
  { re: /(unsplash|pexels|pixabay|shutterstock|istockphoto|gettyimages|freepik)\./i, why: 'stock imagery' },
  { re: /<video\b/i, why: 'embedded video (use the real screenshots, or frames pulled from a screen recording with ffmpeg)' },
];

function stripRuntime(src) {
  // Blank out the runtime blocks but keep their line breaks so line numbers stay right.
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return src
    .replace(/mr:runtime-css start[\s\S]*?mr:runtime-css end/g, blank)
    .replace(/mr:runtime start[\s\S]*?mr:runtime end/g, blank);
}

function scanSource(src) {
  const out = [];
  stripRuntime(src).split('\n').forEach((line, i) => {
    for (const b of BANS) {
      if (b.re.test(line) && !(b.skip && b.skip.test(line))) out.push(`line ${i + 1}: ${b.why}\n      ${line.trim().slice(0, 120)}`);
    }
  });
  return out.concat(afterStyle(src));
}

// CSS written after </style> is not CSS: the browser drops it as text, so the rule silently never applies.
// Looks from each </style> to the next <style> or <body> (in <head>), or to the next tag (in <body>).
function afterStyle(src) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  const out = [], s = src.replace(/<!--[\s\S]*?-->/g, blank).replace(/<(script|title|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, blank);
  const bodyAt = s.search(/<body\b/i), re = /<\/style\s*>/gi;
  for (let m; (m = re.exec(s));) {
    const from = m.index + m[0].length, rest = s.slice(from);
    const end = from < bodyAt ? Math.min(bodyAt - from, ...[rest.search(/<style\b/i)].filter((n) => n >= 0)) : rest.search(/</);
    const gap = rest.slice(0, end < 0 ? rest.length : end).replace(/<[^>]*>/g, (t) => t.replace(/[^\n]/g, ' '));
    const at = gap.search(/\S/);
    if (at < 0) continue;
    const line = s.slice(0, from + at).split('\n').length;
    out.push(`line ${line}: CSS or text after </style> (the browser never applies it); move it inside the <style> block\n      ${gap.slice(at).trim().split('\n')[0].slice(0, 120)}`);
  }
  return out;
}

// Runs inside the page at one moment. Measures every visible line of text by its ink (the glyphs' real
// top and bottom from canvas measureText; the line's own width) and reports ink cut by a clipping
// ancestor (overflow other than visible, a clip-path inset), ink outside its card (the nearest ancestor
// that paints a box) and two text blocks whose ink overlaps. The frame edge is not a clip here (the safe
// area check owns it). Rotated and vertical text are skipped: their box is not their ink.
function layoutAudit(tol) {
  const stage = document.getElementById('stage'), F = stage.getBoundingClientRect();
  const ctx = (window.__mrCtx ||= document.createElement('canvas').getContext('2d'));
  const inks = (window.__mrInk ||= new Map()), ids = (window.__mrIds ||= new WeakMap());
  const idOf = (e) => { if (!ids.has(e)) ids.set(e, (window.__mrN = (window.__mrN || 0) + 1)); return ids.get(e); };
  const nameOf = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : e.classList[0] ? '.' + e.classList[0] : '');
  const alpha = (c) => { if (!c || c === 'transparent') return 0; const m = /\/\s*([\d.]+)(%?)\s*\)$/.exec(c) || /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)()\)$/.exec(c); return m ? m[1] / (m[2] ? 100 : 1) : 1; };
  const box = (cs, e) => cs.display !== 'inline' && cs.display !== 'contents' && (alpha(cs.backgroundColor) > 0.1 || cs.backgroundImage !== 'none'
    || ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs['border' + s + 'Width']) > 0 && alpha(cs['border' + s + 'Color']) > 0.1)) && e;
  const opaque = (e) => { const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && +cs.opacity >= 0.5 && (alpha(cs.backgroundColor) >= 0.5 || cs.backgroundImage !== 'none' || /^(IMG|CANVAS|VIDEO)$/.test(e.tagName)); };
  const memo = new Map();
  // Per element: opacity, hidden, turned (rotated, skewed or vertical), its clips (inner first) and its card.
  const info = (e) => {
    if (e === stage || !e) return { op: 1, hidden: false, turned: false, clips: [], card: null };
    if (memo.has(e)) return memo.get(e);
    const up = info(e.parentElement), cs = getComputedStyle(e), r = e.getBoundingClientRect(), k = e.offsetWidth ? r.width / e.offsetWidth : 1;
    const mt = /matrix\(([^)]+)\)/.exec(cs.transform), m = mt ? mt[1].split(',').map(Number) : [1, 0, 0, 1];
    const clips = [];
    if (cs.display !== 'inline' && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')) {
      const b = (s) => parseFloat(cs['border' + s + 'Width']) * k, x = cs.overflowX !== 'visible', y = cs.overflowY !== 'visible';
      clips.push({ el: e, how: 'overflow', r: { left: x ? r.left + b('Left') : -Infinity, right: x ? r.right - b('Right') : Infinity, top: y ? r.top + b('Top') : -Infinity, bottom: y ? r.bottom - b('Bottom') : Infinity } });
    }
    const ins = /^inset\((.*)\)$/.exec(cs.clipPath), p = ins && ins[1].split(/\s+round\s+/)[0].trim().split(/\s+/);
    if (p && p.every((v) => /^-?[\d.]+(px|%)?$/.test(v))) {
      const [t, rt = t, bt = t, l = rt] = p, v = (s, size) => (s.endsWith('%') ? (parseFloat(s) / 100) * size : parseFloat(s) * k);
      clips.push({ el: e, how: 'clip-path', r: { left: r.left + v(l, r.width), right: r.right - v(rt, r.width), top: r.top + v(t, r.height), bottom: r.bottom - v(bt, r.height) } });
    }
    const out = {
      op: up.op * +cs.opacity, hidden: up.hidden || cs.visibility === 'hidden' || cs.display === 'none',
      turned: up.turned || Math.abs(m[1]) > 1e-3 || Math.abs(m[2]) > 1e-3 || !cs.writingMode.startsWith('horizontal'),
      clips: [...clips, ...up.clips], card: box(cs, e) || up.card,
    };
    memo.set(e, out);
    return out;
  };
  const groupOf = (p) => { const say = p.closest('[data-say]'); if (say) return say; let g = p; while (g.parentElement !== stage && getComputedStyle(g).display === 'inline') g = g.parentElement; return g; };
  const found = [], lines = [];
  const add = (kind, key, rec) => found.push({ kind, key: kind + ':' + key, ...rec });
  // The text of each line box of a wrapped text node, so each line's ink comes from its own glyphs.
  const split = (window.__mrLines ||= new WeakMap());
  const lineTexts = (n, rects) => {
    const str = n.textContent, sig = str + '|' + rects.map((b) => Math.round((b.width * 100) / b.height)).join(',');
    if (split.get(n)?.sig === sig) return split.get(n).out;
    const out = rects.map(() => ''), r = document.createRange();
    for (let i = 0; i < str.length; i++) {
      const w = str.codePointAt(i) > 0xffff ? 2 : 1;
      r.setStart(n, i); r.setEnd(n, i + w);
      const c = r.getBoundingClientRect(), cx = (c.left + c.right) / 2, cy = (c.top + c.bottom) / 2;
      const j = rects.findIndex((b) => cy >= b.top && cy <= b.bottom && cx >= b.left - 1 && cx <= b.right + 1);
      if (j >= 0) out[j] += str.slice(i, i + w);
      i += w - 1;
    }
    split.set(n, { sig, out });
    return out;
  };
  // Where a fault sits relative to what causes it, in units of the font size, plus how visible it is:
  // the same numbers in consecutive samples mean the layout is at rest (a camera push scales them all).
  const rel = (v, fs) => (Number.isFinite(v) ? v / fs : 0);
  const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode, p = n.parentElement, raw = n.textContent;
    if (!raw.trim() || p.closest('svg')) continue;
    const I = info(p);
    if (I.hidden || I.op < 0.05 || I.turned) continue;
    const cs = getComputedStyle(p), tt = cs.textTransform;
    const font = `${cs.fontStyle} ${cs.fontVariantCaps === 'small-caps' ? 'small-caps ' : ''}${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const measure = (s) => {
      s = tt === 'uppercase' ? s.toUpperCase() : tt === 'lowercase' ? s.toLowerCase() : s;
      if (!inks.has(font + '|' + s)) { ctx.font = font; ctx.direction = cs.direction; const q = ctx.measureText(s); inks.set(font + '|' + s, [q.fontBoundingBoxAscent, q.fontBoundingBoxDescent, q.actualBoundingBoxAscent, q.actualBoundingBoxDescent]); }
      return inks.get(font + '|' + s);
    };
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter((b) => b.width >= 0.5 && b.height >= 0.5);
    const texts = rects.length > 1 ? lineTexts(n, rects) : [raw], text = raw.trim().replace(/\s+/g, ' ').slice(0, 30);
    rects.forEach((b, li) => {
      const [fa, fd, a, d] = measure(texts[li]);
      if (!texts[li].trim() || !(fa + fd)) return;
      const k = b.height / (fa + fd), fs = parseFloat(cs.fontSize) * k; // range rects span the font's ascent and descent
      const ink = { left: b.left, right: b.right, top: b.top + (fa - a) * k, bottom: b.top + (fa + d) * k };
      if (ink.right <= F.left || ink.left >= F.right || ink.bottom <= F.top || ink.top >= F.bottom) return;
      const seen = { ...ink }, cuts = [];
      for (const c of I.clips) {
        if (ink.bottom <= c.r.top + tol || ink.top >= c.r.bottom - tol || ink.right <= c.r.left + tol || ink.left >= c.r.right - tol) return; // wholly hidden
        const o = { top: c.r.top - ink.top, bottom: ink.bottom - c.r.bottom, left: c.r.left - ink.left, right: ink.right - c.r.right };
        const side = Object.keys(o).reduce((x, y) => (o[y] > o[x] ? y : x));
        if (o[side] > tol) cuts.push([idOf(p) + '>' + idOf(c.el), { text, el: nameOf(p), by: nameOf(c.el), how: c.how, side, px: o[side], size: [o[side] / fs, rel(ink.left - c.r.left, fs), rel(ink.top - c.r.top, fs), I.op] }]);
        seen.left = Math.max(seen.left, c.r.left); seen.right = Math.min(seen.right, c.r.right); seen.top = Math.max(seen.top, c.r.top); seen.bottom = Math.min(seen.bottom, c.r.bottom);
      }
      // Hidden under an opaque layer at the centre of what shows: not seen, so not judged.
      const cx = Math.min(F.right - 1, Math.max(F.left, (seen.left + seen.right) / 2)), cy = Math.min(F.bottom - 1, Math.max(F.top, (seen.top + seen.bottom) / 2));
      for (const e of document.elementsFromPoint(cx, cy)) { if (e === p || p.contains(e) || e.contains(p)) break; if (opaque(e)) return; }
      for (const [key, rec] of cuts) add('cut', key, rec);
      if (I.card && !I.clips.some((c) => c.el === I.card)) {
        const r = I.card.getBoundingClientRect(), o = { top: r.top - ink.top, bottom: ink.bottom - r.bottom, left: r.left - ink.left, right: ink.right - r.right };
        const side = Object.keys(o).reduce((x, y) => (o[y] > o[x] ? y : x));
        if (o[side] > tol) add('card', idOf(p) + '>' + idOf(I.card), { text, el: nameOf(p), by: nameOf(I.card), side, px: o[side], size: [o[side] / fs, rel(ink.left - r.left, fs), rel(ink.top - r.top, fs), I.op] });
      }
      lines.push({ g: groupOf(p), p, text, ink: seen, fs, op: I.op });
    });
  }
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const A = lines[i], B = lines[j];
    if (A.g === B.g) continue;
    const w = Math.min(A.ink.right, B.ink.right) - Math.max(A.ink.left, B.ink.left), h = Math.min(A.ink.bottom, B.ink.bottom) - Math.max(A.ink.top, B.ink.top);
    if (w <= tol || h <= tol) continue;
    const [x, y] = idOf(A.g) < idOf(B.g) ? [A, B] : [B, A], fs = Math.min(A.fs, B.fs);
    add('overlap', idOf(x.g) + '+' + idOf(y.g), { text: x.text, el: nameOf(x.p), text2: y.text, el2: nameOf(y.p), w, h, px: Math.min(w, h),
      size: [w / fs, h / fs, (x.ink.left - y.ink.left) / fs, (x.ink.top - y.ink.top) / fs, x.op, y.op] });
  }
  // One record per key: the largest of its lines.
  const best = new Map();
  for (const f of found) if (!best.has(f.key) || f.px > best.get(f.key).px) best.set(f.key, f);
  return { lines: lines.length, recs: [...best.values()] };
}

function decode(buf) {
  const png = PNG.sync.read(buf);
  return png;
}

function diff(a, b) {
  let sum = 0, n = 0;
  for (let i = 0; i < a.data.length; i += 8) {
    sum += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    n += 3;
  }
  return sum / n;
}

function lumaSpread(img) {
  let s = 0, s2 = 0, n = 0;
  for (let i = 0; i < img.data.length; i += 16) {
    const y = 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
    s += y; s2 += y * y; n++;
  }
  const m = s / n;
  return Math.sqrt(Math.max(0, s2 / n - m * m));
}

// The soundtrack as render.mjs builds it (with the user's own music under it when given), measured by
// ffmpeg's EBU R128 meter: every 400 ms moment against the loudness of the whole track.
function loudness(meta, audio) {
  const wav = path.join(os.tmpdir(), `motionreels-check-${process.pid}-${Date.now()}.wav`);
  try {
    buildAudio(meta, wav, { musicOff: !!audio });
    const graph = audio ? ['-i', path.resolve(audio), '-filter_complex', `${userMix(meta, 0, 1)},ebur128=framelog=info[a]`, '-map', '[a]', '-t', String(meta.duration)] : ['-af', 'ebur128=framelog=info'];
    const err = spawnSync(ffmpegPath, ['-hide_banner', '-nostats', '-i', wav, ...graph, '-f', 'null', '-'], { encoding: 'utf8' }).stderr || '';
    const I = /Integrated loudness:\s*I:\s*(-?[\d.]+)/.exec(err);
    if (!I) return { warn: 'loudness not measured: ffmpeg returned no EBU R128 summary' };
    if (+I[1] <= -70) return {};
    const over = [...err.matchAll(/t:\s*([\d.]+)\s+TARGET:\S+\s+LUFS\s+M:\s*(-?[\d.]+)/g)].map((m) => [+m[1], +m[2] - +I[1]]).filter(([, lu]) => lu > MAX_SPIKE_LU);
    const spans = [];
    for (const [t, lu] of over) {
      const s = spans[spans.length - 1];
      if (s && t - s.to < 0.15) { s.to = t; s.peak = Math.max(s.peak, lu); } else spans.push({ from: Math.max(0, t - 0.4), to: t, peak: lu });
    }
    return { fails: spans.sort((a, b) => b.peak - a.peak).slice(0, 3).map((s) => {
      const near = (meta.cues || []).filter((c) => c.t >= s.from - 0.5 && c.t <= s.to).map((c) => `${c.name} ${c.t}s`);
      return `the sound spikes ${s.peak.toFixed(1)} LU above the whole track from ${s.from.toFixed(1)}s to ${s.to.toFixed(1)}s (limit ${MAX_SPIKE_LU} LU over any 400 ms)${near.length ? `; cues stacking there: ${near.join(', ')}` : ''}; lower their gain, spread them or drop one`;
    }) };
  } finally {
    fs.rmSync(wav, { force: true });
  }
}

export async function check(target, { lang, quiet = false, audio } = {}) {
  const file = resolvePage(target);
  const fails = [], warns = [];
  let counts = 'not measured';
  const log = (...a) => { if (!quiet) console.log(...a); };

  for (const s of scanSource(fs.readFileSync(file, 'utf8'))) fails.push(`banned in source, ${s}`);

  const { browser, page, meta } = await openPage(file, { lang, scale: 0.25 });
  try {
    if (!MAX_HOLD[meta.intensity]) warns.push(`intensity "${meta.intensity}" unknown; use low (calm), medium or high (checked as medium)`);
    const holdLimit = MAX_HOLD[meta.intensity] || MAX_HOLD.medium;
    // Sound: every cue name and the music style must exist (a misspelt name must fail here, not go silent).
    const music = (meta.sound || {}).music || 'none';
    if (music !== 'none' && !MUSIC[music]) fails.push(`music style "${music}" does not exist; use none, ${Object.keys(MUSIC).join(', ')}`);
    for (const c of meta.cues || []) {
      if (!CUE_NAMES.includes(c.name)) fails.push(`sound cue "${c.name}" at ${c.t}s does not exist; use one of ${CUE_NAMES.join(', ')}`);
      if (!(c.t >= 0 && c.t < meta.duration)) fails.push(`sound cue "${c.name}" at ${c.t}s is outside the video (0 to ${meta.duration}s)`);
    }
    // Dopamine level high: the payoffs use the pachinko family (reach before the reveal, jackpot or fever on it, pachinko or payout on cascades).
    const pach = (meta.cues || []).filter((c) => PACHINKO.includes(c.name));
    if (meta.intensity === 'high' && pach.length < 2) fails.push(`dopamine level high needs pachinko sounds on its payoffs (at least 2 of ${PACHINKO.join(', ')}); found ${pach.length}`);
    if (meta.intensity !== 'high' && pach.length) warns.push(`pachinko sounds (${[...new Set(pach.map((c) => c.name))].join(', ')}) belong to dopamine level high; this video is ${meta.intensity}`);
    if (meta.duration > 45) warns.push(`duration ${meta.duration}s: over 45 seconds usually loses the viewer; one idea per video`);
    // Loudness: every visual hit gets a sound, but no moment spikes (stacked effects).
    if (!fails.some((f) => f.startsWith('sound cue') || f.startsWith('music style')) && (audio || music !== 'none' || (meta.cues || []).length)) {
      const loud = loudness(meta, audio);
      if (loud.warn) warns.push(loud.warn);
      fails.push(...(loud.fails || []));
    }

    // Text audit: every visible word belongs to data-say (message) or data-ui (a recreated screen).
    const text = await page.evaluate((minRatio, width) => {
      const problems = [];
      const walker = document.createTreeWalker(document.getElementById('stage'), NodeFilter.SHOW_TEXT);
      const stray = new Set();
      while (walker.nextNode()) {
        const n = walker.currentNode;
        if (!n.textContent.trim()) continue;
        const el = n.parentElement;
        if (!el.closest('[data-say],[data-ui]')) stray.add(n.textContent.trim().slice(0, 40));
      }
      stray.forEach((s) => problems.push(`text outside data-say or data-ui: "${s}"`));
      document.querySelectorAll('[data-say]').forEach((el) => {
        const s = el.textContent.trim();
        if (!s) return;
        const cjk = (s.match(/[぀-ヿ㐀-鿿가-힯]/g) || []).length;
        if (cjk > 0) { if (cjk > 16) problems.push(`"${s}" has ${cjk} CJK characters; keep a line at 16 or fewer`); }
        else { const words = s.split(/\s+/).filter(Boolean).length; if (words > 8) problems.push(`"${s}" has ${words} words; keep a line at 8 or fewer`); }
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < width * minRatio) problems.push(`"${s.slice(0, 30)}" is ${fs}px; too small to read on a phone (minimum ${Math.round(width * minRatio)}px)`);
      });
      return problems;
    }, MIN_TEXT_RATIO, meta.width);
    fails.push(...text);

    // Frame audit.
    const steps = Math.floor(meta.duration / SAMPLE_STEP) + 1;
    let prev = null, first = null, stillRun = 0, stillStart = 0;
    const holds = [];
    const rest = new Map(), faults = new Map(); // text faults: key -> current still run; key -> reported span
    let measured = 0, moving = 0;
    const safeHits = new Map(); // text -> consecutive samples outside the safe area
    const seenFor = new Map();  // text -> samples on screen
    let startMoved = false;
    for (let i = 0; i < steps; i++) {
      const t = Math.min(meta.duration, i * SAMPLE_STEP);
      await seek(page, t);
      const img = decode(await shot(page, meta));
      if (i === 0) {
        first = img;
        const spread = lumaSpread(img);
        if (spread < 6) fails.push('frame 0 is nearly flat (one colour); open on something already happening');
      } else if (t <= START_WINDOW + 1e-6 && diff(first, img) > 1.0) startMoved = true;
      if (prev) {
        const d = diff(prev, img);
        if (d < STILL_DIFF) { if (stillRun === 0) stillStart = t - SAMPLE_STEP; stillRun++; }
        else { if (stillRun) holds.push([stillStart, stillRun * SAMPLE_STEP, false]); stillRun = 0; }
      }
      prev = img;

      const out = await page.evaluate((safe, W, H) => {
        const bad = [], shown = [];
        document.querySelectorAll('[data-say]').forEach((el) => {
          const s = el.textContent.trim();
          if (!s) return;
          let o = 1;
          for (let e = el; e && e.id !== 'stage'; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity);
          if (o < 0.05) return;
          const r = el.getBoundingClientRect();
          // Measure the ink, not the box: a wide block with short text is fine.
          const range = document.createRange(); range.selectNodeContents(el);
          const ink = range.getBoundingClientRect();
          const box = ink.width ? ink : r;
          if (box.bottom < 0 || box.top > H || box.right < 0 || box.left > W) return;
          // Text hidden under another layer is not seen by the viewer: skip it.
          const px = Math.min(W - 1, Math.max(0, (box.left + box.right) / 2)), py = Math.min(H - 1, Math.max(0, (box.top + box.bottom) / 2));
          const seen = (n) => { let op = 1; for (let e = n; e && e.id !== 'stage'; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') return false; op *= parseFloat(cs.opacity); } return op > 0.05; };
          const top = document.elementsFromPoint(px, py).find(seen);
          if (top && top !== el && !el.contains(top) && !top.contains(el)) return;
          const cs = getComputedStyle(el).clipPath;
          const m = /inset\((-?[\d.]+)%\s+-?[\d.]+%\s+(-?[\d.]+)%/.exec(cs || '');
          if (!m || +m[1] + +m[2] < 60) shown.push(s);
          if (box.top < safe.top || box.bottom > H - safe.bottom || box.left < safe.side || box.right > W - safe.side) bad.push(s.slice(0, 40));
        });
        return { bad, shown };
      }, meta.safe, meta.width, meta.height);
      // Text faults count only at rest: the same fault, the same size relative to the font, in AT_REST + 1
      // samples in a row. A reveal, an exit or a crossing changes size every sample and passes.
      const now = new Set();
      const lay = await page.evaluate(layoutAudit, INK_TOL);
      measured += lay.lines; moving += lay.recs.length;
      for (const r of lay.recs) {
        const prev = rest.get(r.key), n = prev && r.size.every((v, j) => Math.abs(v - prev.size[j]) <= 0.02) ? prev.n + 1 : 0;
        const run = { n, size: r.size, from: n ? prev.from : t };
        rest.set(r.key, run); now.add(r.key);
        if (n < AT_REST) continue;
        const f = faults.get(r.key) || { rec: r, from: run.from };
        f.to = t; if (r.px > f.rec.px) f.rec = r;
        faults.set(r.key, f);
      }
      for (const key of [...rest.keys()]) if (!now.has(key)) rest.delete(key);
      for (const s of new Set(out.shown)) seenFor.set(s, (seenFor.get(s) || 0) + 1);
      const seen = new Set(out.bad);
      for (const s of seen) safeHits.set(s, (safeHits.get(s) || 0) + 1);
      for (const s of [...safeHits.keys()]) if (!seen.has(s)) {
        if (safeHits.get(s) >= 5) fails.push(`"${s}" sits outside the safe area (platform buttons cover it) for ${(safeHits.get(s) * SAMPLE_STEP).toFixed(1)}s`);
        safeHits.delete(s);
      }
    }
    for (const [s, n] of safeHits) if (n >= 5) fails.push(`"${s}" sits outside the safe area (platform buttons cover it) at the end`);
    counts = `${measured} lines of text measured over ${steps} frames; ${moving} fault sightings, ${faults.size} faults held at rest`;
    for (const { rec: r, from, to } of faults.values()) {
      const when = `at rest from ${from.toFixed(1)}s to ${to.toFixed(1)}s`, px = Math.round(r.px);
      if (r.kind === 'cut') fails.push(`"${r.text}" (${r.el}) is cut ${px}px at its ${r.side} by the ${r.how} of ${r.by}, ${when}; give the clip room past the glyphs (padding, or a negative clip inset)`);
      if (r.kind === 'card') fails.push(`"${r.text}" (${r.el}) runs ${px}px out of the ${r.side} of its card ${r.by}, ${when}; widen the card or wrap the text inside it`);
      if (r.kind === 'overlap') fails.push(`"${r.text}" (${r.el}) overlaps "${r.text2}" (${r.el2}) by ${Math.round(r.w)}x${Math.round(r.h)}px, ${when}; move them apart`);
    }
    if (stillRun) holds.push([stillStart, stillRun * SAMPLE_STEP, true]);
    for (const [s, n] of seenFor) { const on = n * SAMPLE_STEP, need = readNeed(s); if (on + 1e-6 < need) fails.push(`"${s.slice(0, 40)}" is readable for ${on.toFixed(1)}s; it needs ${need.toFixed(1)}s`); }
    if (!startMoved) fails.push(`nothing moves in the first ${START_WINDOW}s; the first frame must already be in motion (a still opening is swiped away)`);
    for (const [at, len, atEnd] of holds) {
      const limit = atEnd ? meta.endHold : holdLimit;
      if (len > limit + 1e-6) fails.push(`${atEnd ? 'end card holds' : 'the picture holds still'} for ${len.toFixed(1)}s from ${at.toFixed(1)}s (limit ${limit}s); keep something moving (intensity ${meta.intensity})`);
    }
  } finally {
    await browser.close();
  }

  log(`\nmotionreels check: ${file}${lang ? ` [${lang}]` : ''}`);
  log(`  text  ${counts}`);
  for (const f of fails) log(`  FAIL  ${f}`);
  for (const w of warns) log(`  WARN  ${w}`);
  log(fails.length ? `\n${fails.length} problem(s). Fix them before rendering.\n` : '  PASS  no banned patterns, motion from frame 0, no long holds, text fits, nothing cut or overlapping, no sound spikes\n');
  return { ok: fails.length === 0, fails, warns, counts };
}

const realOf = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
if (process.argv[1] && realOf(process.argv[1]) === realOf(fileURLToPath(import.meta.url))) {
  const args = parseArgs(process.argv.slice(2));
  const res = await check(args._[0], { lang: args.lang, quiet: !!args.json, audio: args.audio });
  if (args.json) console.log(JSON.stringify(res, null, 2));
  process.exit(res.ok ? 0 : 1);
}
