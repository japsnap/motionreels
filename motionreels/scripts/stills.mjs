// Saves single frames as PNG so the agent (and you) can look before rendering the whole video.
// Usage: node stills.mjs <video-folder> 0 1.5 3 [--lang ja] [--scale 0.5]
// With no times given it saves one frame every second. Output: <video-folder>/stills/
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, resolvePage, openPage, seek, shot } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const file = resolvePage(args._[0]);
const outDir = path.join(path.dirname(file), 'stills');
fs.mkdirSync(outDir, { recursive: true });
const { browser, page, meta } = await openPage(file, { lang: args.lang, scale: args.scale ? +args.scale : 0.5 });
let times = args._.slice(1).map(Number).filter((n) => !Number.isNaN(n));
if (!times.length) times = Array.from({ length: Math.floor(meta.duration) + 1 }, (_, i) => i);
for (const t of times) {
  await seek(page, t);
  const out = path.join(outDir, `${args.lang || meta.lang}-${t.toFixed(2)}s.png`);
  fs.writeFileSync(out, await shot(page, meta));
  console.log(out);
}
await browser.close();
