// Records the video page frame by frame and encodes an MP4. Runs the slop check first.
// Usage: node render.mjs <video-folder> [--lang ja | --all-langs] [--audio music.mp3] [--crf 18]
// Output: <video-folder>/out/<folder-name>-<lang>-<W>x<H>.mp4, then verified by reading it back.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { parseArgs, resolvePage, openPage, seek, shot, fail } from './lib.mjs';
import { check } from './check.mjs';

const args = parseArgs(process.argv.slice(2));
const file = resolvePage(args._[0]);
const dir = path.dirname(file);
const name = path.basename(dir);

async function langsOf() {
  if (!args['all-langs']) return [args.lang || null];
  const { browser, meta } = await openPage(file, { scale: 0.25 });
  await browser.close();
  return meta.langs;
}

function probe(mp4) {
  // ffmpeg -i prints the container's facts on stderr and exits 1 (no output named); that is expected.
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-i', mp4], { encoding: 'utf8' });
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr);
  const v = /Video: (\w+).*?, (\d{2,5})x(\d{2,5})/.exec(r.stderr);
  return {
    seconds: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : null,
    codec: v ? v[1] : null,
    width: v ? +v[2] : null,
    height: v ? +v[3] : null,
  };
}

async function renderOne(lang) {
  if (!args['no-check']) {
    const res = await check(file, { lang });
    if (!res.ok) fail('Check failed, nothing rendered. Fix the problems above (or read references/craft.md).');
  }
  let { browser, page, meta } = await openPage(file, { lang });
  const frames = Math.round(meta.duration * meta.fps);
  const outDir = path.join(dir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${name}-${lang || meta.lang}-${meta.width}x${meta.height}.mp4`);

  const ff = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(meta.fps), '-c:v', 'png', '-i', '-'];
  if (args.audio) ff.push('-i', path.resolve(args.audio));
  ff.push('-c:v', 'libx264', '-preset', 'medium', '-crf', String(args.crf || 18), '-pix_fmt', 'yuv420p', '-r', String(meta.fps), '-movflags', '+faststart');
  if (args.audio) ff.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
  ff.push(out);
  const enc = spawn(ffmpegPath, ff, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => enc.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));

  console.log(`rendering ${frames} frames (${meta.duration}s at ${meta.fps}fps, ${meta.width}x${meta.height}, ${lang || meta.lang})`);
  let restarts = 0;
  for (let i = 0; i < frames; i++) {
    let buf;
    try {
      // Test seam: MR_TEST_CRASH=<frame> kills Chrome once at that frame to exercise the recovery below.
      if (process.env.MR_TEST_CRASH && +process.env.MR_TEST_CRASH === i && restarts === 0) await browser.close();
      await seek(page, i / meta.fps);
      buf = await shot(page, meta);
    } catch (e) {
      // Chrome sometimes dies on long renders; reopen it and carry on from this frame.
      if (++restarts > 3) throw e;
      console.log(`\n  Chrome stopped at frame ${i} (${String(e.message).split('\n')[0]}); reopening, attempt ${restarts} of 3`);
      await browser.close().catch(() => {});
      ({ browser, page } = await openPage(file, { lang }));
      i--;
      continue;
    }
    if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
    if (i % meta.fps === 0) process.stdout.write(`\r  ${Math.round((i / frames) * 100)}%`);
  }
  enc.stdin.end();
  await browser.close();
  await done;
  process.stdout.write('\r  100%\n');

  // Verify the real file, not the encoder's exit code.
  const size = fs.existsSync(out) ? fs.statSync(out).size : 0;
  const p = probe(out);
  const problems = [];
  if (size < 50_000) problems.push(`file is only ${size} bytes`);
  if (p.codec !== 'h264') problems.push(`video codec is ${p.codec}, expected h264`);
  if (p.width !== meta.width || p.height !== meta.height) problems.push(`size is ${p.width}x${p.height}, expected ${meta.width}x${meta.height}`);
  if (p.seconds === null || Math.abs(p.seconds - meta.duration) > 0.25) problems.push(`duration is ${p.seconds}s, expected ${meta.duration}s`);
  if (problems.length) fail(`Rendered file failed verification: ${problems.join('; ')}\n  ${out}`);
  console.log(`  OK  ${out}\n      ${(size / 1e6).toFixed(1)} MB, ${p.seconds}s, ${p.width}x${p.height}, h264`);
  return out;
}

for (const lang of await langsOf()) await renderOne(lang);
