// Shared pieces for check.mjs, render.mjs and stills.mjs: find the video page,
// open it in headless Chrome at its real size, and move it to any time.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else args._.push(a);
  }
  return args;
}

// Accepts a folder holding index.html, or the html file itself.
export function resolvePage(target) {
  if (!target) fail('Give the video folder (the one holding index.html) as the first argument.');
  let file = path.resolve(target);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) fail(`No page found at ${file}`);
  return file;
}

export function fail(msg) {
  console.error(`\n[motionreels] ${msg}\n`);
  process.exit(1);
}

// Opens the page in render mode and returns { browser, page, meta }.
// scale < 1 renders smaller frames, which is enough for the checks and much faster.
export async function openPage(file, { lang, scale = 1 } = {}) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'],
  });
  const page = await browser.newPage();
  const url = new URL(pathToFileURL(file).href);
  url.searchParams.set('render', '1');
  if (lang) url.searchParams.set('lang', lang);
  // First load at a guess to read the real size, then resize to it.
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: scale });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url.href, { waitUntil: 'networkidle0', timeout: 60000 });
  const hasRuntime = await page.evaluate(() => !!(window.MR && window.MR.seek));
  if (!hasRuntime) {
    await browser.close();
    fail('The page has no motionreels runtime (window.MR). Start from template/index.html.');
  }
  await page.evaluate(() => window.MR.ready);
  const meta = await page.evaluate(() => window.MR.meta());
  // Language codes become part of output file names, so only plain codes are allowed (en, ja, pt-BR).
  const bad = [...(meta.langs || []), meta.lang].filter((l) => !/^[A-Za-z]{2,3}(-[A-Za-z]{2,4})?$/.test(String(l)));
  if (bad.length) { await browser.close(); fail(`Language codes must look like en, ja or pt-BR; got: ${bad.join(', ')}`); }
  await page.setViewport({ width: meta.width, height: meta.height, deviceScaleFactor: scale });
  await page.evaluate(() => window.MR.ready);
  if (errors.length) {
    await browser.close();
    fail(`The page threw errors while loading:\n  ${errors.join('\n  ')}`);
  }
  return { browser, page, meta, errors };
}

// The user's own music (input `music`) under the generated effects (input `fx`), as an ffmpeg filter.
// render.mjs mixes with it and check.mjs measures the loudness of the same mix.
export const userMix = (meta, fx, music) => `[${music}:a]volume=0.5,afade=t=out:st=${Math.max(0, meta.duration - 1.2)}:d=1.2[m];[${fx}:a][m]amix=inputs=2:normalize=0`;

export async function seek(page, t) {
  await page.evaluate((tt) => window.MR.seek(tt), t);
}

export async function shot(page, meta, type = 'png', quality) {
  const opts = { type, clip: { x: 0, y: 0, width: meta.width, height: meta.height }, captureBeyondViewport: false };
  if (type === 'jpeg') opts.quality = quality ?? 92;
  return page.screenshot(opts);
}
