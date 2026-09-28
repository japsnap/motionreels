// Tests the preview page's Record button end to end: clicks it in Chrome with tab capture
// auto-accepted, waits for the recording, saves the file, and checks it with ffmpeg.
// Usage: node test-record.mjs <video-folder>   (maintainer test, not used by the skill)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import ffmpegPath from 'ffmpeg-static';
import { resolvePage, fail } from './lib.mjs';

const file = resolvePage(process.argv[2]);
const browser = await puppeteer.launch({
  headless: process.argv.includes('--headed') ? false : true,
  args: ['--auto-accept-this-tab-capture', '--auto-select-desktop-capture-source=Entire screen', '--use-fake-ui-for-media-stream'],
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1000 });
await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle0' });
await page.evaluate(() => window.MR.ready);
const dur = await page.evaluate(() => window.MR.meta().duration);
await page.click('#mr-rec');
await page.waitForFunction(() => window.MR.lastRecording || /not allowed|needs/.test(document.getElementById('mr-msg').textContent), { timeout: (dur + 20) * 1000 });
const res = await page.evaluate(async () => {
  const b = window.MR.lastRecording;
  if (!b) return { error: document.getElementById('mr-msg').textContent };
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { type: b.type, size: b.size, b64: btoa(s), info: JSON.stringify(window.MR.recordInfo) };
});
await browser.close();
if (res.error) fail(`Record failed: ${res.error}`);
const out = path.join(path.dirname(file), 'out', `record-test.${res.type.includes('mp4') ? 'mp4' : 'webm'}`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(res.b64, 'base64'));
const probe = spawnSync(ffmpegPath, ['-hide_banner', '-i', out], { encoding: 'utf8' }).stderr;
const d = /Duration: ([\d:.]+)/.exec(probe), v = /Video: (\w+).*?, (\d+)x(\d+)/.exec(probe);
console.log(res.info); console.log(`recorded ${res.type}, ${(res.size / 1e6).toFixed(2)} MB -> ${out}\n  duration ${d ? d[1] : '?'}, ${v ? `${v[1]} ${v[2]}x${v[3]}` : 'no video stream found'}`);
