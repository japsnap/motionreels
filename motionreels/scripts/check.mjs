// The slop gate. Reads the video page two ways and fails loudly on anything banned:
//   1. the source: blur, 3D flips, particles, glow, CSS animation, randomness, stock media
//   2. the rendered frames: nothing moving at frame 0, a flat first frame, any hold over
//      about a second, text that is too long, too small, or sits under the platform's buttons
// Usage: node check.mjs <video-folder> [--lang ja] [--json]
// Exit code 0 = passed, 1 = failed. render.mjs runs this first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { parseArgs, resolvePage, openPage, seek, shot } from './lib.mjs';
import { CUE_NAMES, MUSIC, PACHINKO } from './audio.mjs';

const SAMPLE_STEP = 0.1;      // seconds between sampled frames
const STILL_DIFF = 0.25;      // mean pixel change (0-255) below which two samples count as still
const MAX_HOLD = { calm: 1.6, low: 1.6, medium: 1.2, high: 0.8 }; // longest still stretch mid-video, by intensity (the dopamine level; low = calm)
const START_WINDOW = 0.3;     // something must visibly move within this many seconds of frame 0
const MIN_TEXT_RATIO = 0.04;  // smallest readable text as a share of the frame width
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
  return out;
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

export async function check(target, { lang, quiet = false } = {}) {
  const file = resolvePage(target);
  const fails = [], warns = [];
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
          const m = /inset\(([\d.]+)%\s+[\d.]+%\s+([\d.]+)%/.exec(cs || '');
          if (!m || +m[1] + +m[2] < 60) shown.push(s);
          if (box.top < safe.top || box.bottom > H - safe.bottom || box.left < safe.side || box.right > W - safe.side) bad.push(s.slice(0, 40));
        });
        return { bad, shown };
      }, meta.safe, meta.width, meta.height);
      for (const s of new Set(out.shown)) seenFor.set(s, (seenFor.get(s) || 0) + 1);
      const seen = new Set(out.bad);
      for (const s of seen) safeHits.set(s, (safeHits.get(s) || 0) + 1);
      for (const s of [...safeHits.keys()]) if (!seen.has(s)) {
        if (safeHits.get(s) >= 5) fails.push(`"${s}" sits outside the safe area (platform buttons cover it) for ${(safeHits.get(s) * SAMPLE_STEP).toFixed(1)}s`);
        safeHits.delete(s);
      }
    }
    for (const [s, n] of safeHits) if (n >= 5) fails.push(`"${s}" sits outside the safe area (platform buttons cover it) at the end`);
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
  for (const f of fails) log(`  FAIL  ${f}`);
  for (const w of warns) log(`  WARN  ${w}`);
  log(fails.length ? `\n${fails.length} problem(s). Fix them before rendering.\n` : '  PASS  no banned patterns, motion from frame 0, no long holds, text fits\n');
  return { ok: fails.length === 0, fails, warns };
}

const realOf = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
if (process.argv[1] && realOf(process.argv[1]) === realOf(fileURLToPath(import.meta.url))) {
  const args = parseArgs(process.argv.slice(2));
  const res = await check(args._[0], { lang: args.lang, quiet: !!args.json });
  if (args.json) console.log(JSON.stringify(res, null, 2));
  process.exit(res.ok ? 0 : 1);
}
