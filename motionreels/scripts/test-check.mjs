// Tests check.mjs on small pages that each break one rule, and on the same page with the rule kept.
// Each page is template/index.html (its runtime blocks) with its own styles, markup and script, written
// to a temp folder and checked by the real check() in headless Chrome. The kept pages also move text
// through a clip and across other text on the way in, which must pass: only faults at rest count.
// Usage: node test-check.mjs [--keep <folder>]   (maintainer test, not used by the skill)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib.mjs';
import { check } from './check.mjs';

const args = parseArgs(process.argv.slice(2));
const template = fs.readFileSync(fileURLToPath(new URL('../template/index.html', import.meta.url)), 'utf8');
const dir = args.keep ? path.resolve(args.keep) : fs.mkdtempSync(path.join(os.tmpdir(), 'motionreels-test-check-'));
fs.mkdirSync(dir, { recursive: true });

const BASE = `#stage { background: #F6F3EC; color: #16140F; font-family: 'Inter', sans-serif; }
#mover { position: absolute; left: 0; top: 1350px; width: 300px; height: 300px; border-radius: 150px; background: #2F5BFF; }
.say { position: absolute; left: 96px; right: 96px; font-weight: 800; font-size: 80px; line-height: 1.2; }`;
// Twenty light effects spread over 8 seconds: the bed a loud moment is measured against.
const LIGHT = Array.from({ length: 20 }, (_, i) => `MR.cue(${(0.3 + i * 0.37).toFixed(2)}, '${['tick', 'tap', 'click', 'blip', 'pop'][i % 5]}');`).join(' ');

function page(name, { css = '', html, js = '', after = '', sound = "{ music: 'none' }", cues = '', dur = 3 }) {
  let s = template;
  const swap = (re, fn) => { if (!re.test(s)) throw new Error(`template marker not found: ${re}`); s = s.replace(re, fn); };
  swap(/(\/\* ---- the video's own styles below ---- \*\/)[\s\S]*?(<\/style>)/, (m, a, b) => `${a}\n${BASE}\n${css}\n${b}${after}`);
  swap(/(<div id="stage">)[\s\S]*?(\r?\n<\/div>\r?\n\r?\n<div id="mr-bar">)/, (m, a, b) => `${a}\n<div id="mover"></div>\n${html}${b}`);
  swap(/(<script>\r?\n)\/\* ---- the video -[\s\S]*?(<\/script>\r?\n<\/body>)/, (m, a, b) =>
    `${a}MR.config({ width: 1080, height: 1920, fps: 30, duration: ${dur}, langs: ['en'], intensity: 'medium', name: 'test-${name}', sound: ${sound} });\n${cues}\nMR.update((t) => { set('#mover', { x: lerp(60, 720, (t % 3) / 3) }); ${js} });\n${b}`);
  const file = path.join(dir, `${name}.html`);
  fs.writeFileSync(file, s);
  return file;
}

// Each case: a page that breaks the rule (must FAIL with a line matching `expect`), and the same page kept (must PASS).
const CASES = [
  {
    rule: 'J1 CSS after </style>', expect: /after <\/style>/,
    bad: { html: '<div class="say" style="top:700px" data-say>Styles stay inside</div>', after: '\n.say { color: #2F5BFF; }\n' },
    good: { html: '<div class="say" style="top:700px" data-say>Styles stay inside</div>', css: '.say { color: #2F5BFF; }' },
  },
  {
    rule: 'C1 glyphs cut by an overflow box', expect: /is cut \d+px at its bottom by the overflow/,
    bad: { css: '#m { position: absolute; left: 96px; top: 700px; overflow: hidden; } #w { font: 800 96px/0.8 Inter, sans-serif; }',
      html: '<div id="m"><div id="w" data-say>gypsy jogging</div></div>', js: `set('#w', { y: lerp(150, 0, k(t, 0, 0.6)) });` },
    good: { css: '#m { position: absolute; left: 96px; top: 700px; overflow: hidden; padding: 30px 0; } #w { font: 800 96px/0.8 Inter, sans-serif; }',
      html: '<div id="m"><div id="w" data-say>gypsy jogging</div></div>', js: `set('#w', { y: lerp(150, 0, k(t, 0, 0.6)) });` },
  },
  {
    rule: 'C1 glyphs cut by a clip-path mask', expect: /is cut \d+px at its (bottom|top) by the clip-path/,
    bad: { css: '#w { position: absolute; left: 96px; top: 700px; font: 800 96px/0.8 Inter, sans-serif; }', html: '<div id="w" data-say>gypsy jogging</div>',
      js: `set('#w', { clip: [0, 0, lerp(100, 0, k(t, 0, 0.6)), 0] });` },
    good: { css: '#w { position: absolute; left: 96px; top: 700px; font: 800 96px/0.8 Inter, sans-serif; }', html: '<div id="w" data-say>gypsy jogging</div>',
      js: `set('#w', { clip: [-40, -5, lerp(140, -40, k(t, 0, 0.6)), -5] });` },
  },
  {
    rule: 'C5 text running out of its card', expect: /runs \d+px out of the right of its card/,
    bad: { css: '.chip { position: absolute; left: 120px; top: 900px; width: 380px; padding: 20px 30px; background: #fff; border-radius: 40px; white-space: nowrap; font-size: 60px; font-weight: 800; }', html: '<div class="chip" data-say>Compliments everywhere</div>' },
    good: { css: '.chip { position: absolute; left: 120px; top: 900px; padding: 20px 30px; background: #fff; border-radius: 40px; white-space: nowrap; font-size: 60px; font-weight: 800; }', html: '<div class="chip" data-say>Compliments everywhere</div>' },
  },
  {
    rule: 'C5 two text blocks overlapping', expect: /overlaps "/,
    bad: { html: '<div class="say" id="a" style="top:700px" data-say>First line here</div><div class="say" id="b" style="top:745px" data-say>Second line</div>' },
    good: { html: '<div class="say" id="a" style="top:700px" data-say>First line here</div><div class="say" id="b" style="top:745px" data-say>Second line</div>',
      js: `set('#b', { y: lerp(0, 200, k(t, 0, 0.6)) });` },
  },
  {
    rule: 'I1 a stack of effects spiking the sound', expect: /sound spikes [\d.]+ LU above/,
    bad: { dur: 8, html: '<div class="say" style="top:700px" data-say>One loud moment</div>', sound: "{ music: 'none', seed: 7 }",
      cues: LIGHT + ['jackpot', 'fever', 'chime', 'bell', 'success', 'ding', 'boom', 'impact'].map((c) => ` MR.cue(4, '${c}');`).join('') },
    good: { dur: 8, html: '<div class="say" style="top:700px" data-say>One loud moment</div>', sound: "{ music: 'none', seed: 7 }", cues: LIGHT + " MR.cue(4, 'pop');" },
  },
];

let wrong = 0;
for (const [i, c] of CASES.entries()) {
  for (const kind of ['bad', 'good']) {
    const file = page(`${i + 1}-${c.rule.split(' ')[0]}-${kind}`, c[kind]);
    const res = await check(file, { quiet: true });
    const hit = res.fails.filter((f) => c.expect.test(f));
    const ok = kind === 'bad' ? hit.length > 0 : res.ok;
    if (!ok) wrong++;
    console.log(`${ok ? 'ok  ' : 'WRONG'} ${c.rule}, ${kind === 'bad' ? 'broken page fails' : 'kept page passes'}`);
    for (const f of kind === 'bad' ? hit : res.fails) console.log(`        ${f.split('\n')[0]}`);
    console.log(`        text: ${res.counts}`);
  }
}
if (!args.keep) fs.rmSync(dir, { recursive: true, force: true });
console.log(wrong ? `\n${wrong} case(s) wrong` : `\nall ${CASES.length * 2} cases as expected`);
process.exit(wrong ? 1 : 0);
