// Records the video page frame by frame and encodes an MP4. Runs the slop check first.
// Usage: node render.mjs <video-folder> [--lang ja | --all-langs] [--audio music.mp3] [--crf 18]
// Output: <video-folder>/out/<folder-name>-<lang>-<W>x<H>.mp4, then verified by reading it back.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { parseArgs, resolvePage, openPage, seek, shot, fail } from './lib.mjs';
import { check } from './check.mjs';
import { buildAudio } from './audio.mjs';

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

// Music repertoire: every rendered track is logged; a different video may not reuse a track,
// and reusing the style of either of the last two videos is warned about.
function logTrack(plan, video) {
  // The built-in example is a test render, not a user's video: never let it count against their history.
  if (video === 'template') return;
  const file = path.join(os.homedir(), '.motionreels', 'used.json');
  let used = [];
  try { used = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { used = []; }
  const clash = used.find((u) => u.signature === plan.signature && u.video !== video);
  if (clash) fail(`This music track was already used by "${clash.video}" on ${clash.date}. Pick another style, or set sound.seed to a new number.`);
  const recent = used.filter((u) => u.video !== video).slice(-2);
  if (recent.some((u) => u.style === plan.style)) console.log(`  WARN  music style "${plan.style}" was also used by ${recent.filter((u) => u.style === plan.style).map((u) => u.video).join(', ')}; the track differs, but a different style would sound fresher`);
  used = used.filter((u) => u.video !== video);
  used.push({ video, date: new Date().toISOString().slice(0, 10), style: plan.style, key: plan.key, bpm: plan.bpm, seed: plan.seed, signature: plan.signature });
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(used, null, 1)); } catch (e) { console.log(`  WARN  could not write ${file}: ${e.message}`); }
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

  // Sound: the generated track (music bed + effects), with the user's own music file under it if given.
  const wantSound = !args['no-audio'] && (args.audio || (meta.cues || []).length || ((meta.sound || {}).music || 'none') !== 'none');
  let wav = null;
  if (wantSound) {
    wav = path.join(outDir, `${name}-sound.wav`);
    const a = buildAudio(meta, wav, { musicOff: !!args.audio });
    console.log(`sound: ${a.cues} effects, music ${a.music}${a.plan ? ` (key ${a.plan.key}, chords ${a.plan.prog.join('-')}, ${a.plan.bpm} BPM, seed ${a.plan.seed})` : ''}${args.audio ? ` (${path.basename(args.audio)})` : ''}`);
    if (a.plan) logTrack(a.plan, name);
  }
  const ff = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(meta.fps), '-c:v', 'png', '-i', '-'];
  if (wav) ff.push('-i', wav);
  if (args.audio) ff.push('-i', path.resolve(args.audio));
  ff.push('-c:v', 'libx264', '-preset', 'medium', '-crf', String(args.crf || 18), '-pix_fmt', 'yuv420p', '-r', String(meta.fps), '-movflags', '+faststart');
  if (wav && args.audio) ff.push('-filter_complex', `[2:a]volume=0.5,afade=t=out:st=${Math.max(0, meta.duration - 1.2)}:d=1.2[m];[1:a][m]amix=inputs=2:normalize=0[a]`, '-map', '0:v', '-map', '[a]');
  else if (wav) ff.push('-map', '0:v', '-map', '1:a');
  if (wav) ff.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
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
  if (wav) {
    const vd = spawnSync(ffmpegPath, ['-hide_banner', '-i', out, '-map', '0:a', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const mv = /mean_volume: (-?[\d.]+) dB/.exec(vd);
    if (!mv) problems.push('no audio stream in the file');
    else if (+mv[1] < -45) problems.push(`audio is nearly silent (mean ${mv[1]} dB)`);
    else p.audio = `${mv[1]} dB mean`;
    fs.rmSync(wav, { force: true });
  }
  if (problems.length) fail(`Rendered file failed verification: ${problems.join('; ')}\n  ${out}`);
  console.log(`  OK  ${out}\n      ${(size / 1e6).toFixed(1)} MB, ${p.seconds}s, ${p.width}x${p.height}, h264${p.audio ? `, sound ${p.audio}` : ', no sound'}`);
  return out;
}

for (const lang of await langsOf()) await renderOne(lang);
