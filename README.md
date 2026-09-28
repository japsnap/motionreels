# motionreels

A skill for Claude Code and Codex that interviews you about your app, reads your site, and makes a short motion-design video of your real product: a one-feature intro, a brand promo, a walkthrough or a launch cut. It talks to you in your language (Japanese and English fully supported) and renders an MP4.

Made with Claude Opus 5.5.

**Easiest way, no install:** open ChatGPT or Claude and send one message:

> Read the skill at https://github.com/japsnap/motionreels and follow it to make a promo video of https://your-site.example . Give me the MP4 at the end.

(日本語: 「https://github.com/japsnap/motionreels のスキルを読んで、その手順どおりに https://あなたのサイト のプロモ動画を作って。最後はMP4でください。」)

**For AI assistants given this link:** fetch these three files and follow `SKILL.md` exactly (its "In a chat app" section applies): https://raw.githubusercontent.com/japsnap/motionreels/main/motionreels/SKILL.md , https://raw.githubusercontent.com/japsnap/motionreels/main/motionreels/references/craft.md , https://raw.githubusercontent.com/japsnap/motionreels/main/motionreels/template/index.html . Start by asking the user SKILL.md's questions.

**日本語の説明は下にあります。**

## Why it looks sharp instead of generic

- **Your real product.** The skill reads your site's actual colours, fonts and wording, and rebuilds your real screens from your screenshots. It is told never to generate fake footage or invent UI your app does not have; the script cannot check that, so look at the stills.
- **Code, not a video model.** The video is one HTML page animated by time and recorded frame by frame, so every frame is exact and every note ("make the chart slower") is a one-line fix.
- **Slop is blocked by a script.** `scripts/check.mjs` refuses to render when it finds blur-ins, 3D flips, particles, glow, a still opening, a picture held still longer than the chosen intensity allows, a line shown too briefly to read, lines over 8 words (16 characters in Japanese), text too small for a phone, or text under Instagram's buttons. The rules it cannot check by machine (crossfades, generic icons, invented UI) are written in `motionreels/references/craft.md` for the agent to follow.
- **Built for the first three seconds.** Short-video platforms rank on how many people swipe away in the first 3 seconds, so frame 0 must already be moving and show something specific.

## How a session goes

1. You say "make a promo video for my app" (or 「アプリの紹介動画を作って」).
2. In its first reply it asks three short things (your URL, what people should see or feel, screenshots) plus an optional list you can add to (length, format, sound, intensity, colours...). Skip any; it decides the rest from your site and screens.
3. It reads your site and screenshots and plans the video, checking a still of every scene itself.
4. It animates, runs the checker, and hands you the finished MP4, with a list of what it decided.
5. Want changes? Say them in plain words. It keeps every version, logs your notes, and edits the video you already have rather than starting over.

## Use it

**Claude Code** (the full version, best quality)

1. Install once. macOS or Linux:
   ```sh
   git clone https://github.com/japsnap/motionreels
   cp -r motionreels/motionreels ~/.claude/skills/
   ```
   Windows PowerShell, one line at a time:
   ```powershell
   git clone https://github.com/japsnap/motionreels
   Copy-Item -Recurse motionreels\motionreels $HOME\.claude\skills\
   ```
2. Open Claude Code in your project folder and say "make a promo video for my app", or type `/motionreels`.
3. Answer the questions (skip what you like), approve the beat sheet and key frames, give notes on the preview.
4. It renders the MP4 for you. The first time, if [Node.js](https://nodejs.org) is missing, it offers to install it with one command you approve (`winget` on Windows, `brew` on macOS), then downloads a headless Chrome and FFmpeg once (about 200 MB).

**Codex**: the same, with `~/.codex/skills/` in place of `~/.claude/skills/`.

**claude.ai** (no install; tested with Claude Opus 5.5, which made the MP4 with sound itself when asked)

1. Download this repo as a ZIP (green Code button, Download ZIP), unzip it, and zip the inner `motionreels` folder on its own.
2. In claude.ai open Settings, Capabilities, Skills, and upload that ZIP.
3. In a new chat, ask for a promo video of your app and answer the questions. Ask for the MP4; if it can't make one, you get an `index.html` file.
4. Download it, open it in desktop Chrome or Edge, press **Record video**, choose "this tab" and allow it. The video plays once and an MP4 downloads (WebM where the browser cannot record MP4). Use a full-screen window: the quality is the size it shows on your screen.

**ChatGPT** (no install; tested on the Plus plan with its default model, GPT-5.6 Sol per OpenAI's release notes, at medium thinking effort: usable but weaker than Claude Opus 5.5 (the same checker found 45 problems in its page against 1 in Opus 5.5's), and it made an MP4 when asked)

1. Download this repo as a ZIP and unzip it.
2. In ChatGPT start a new chat and attach three files: `motionreels/SKILL.md`, `motionreels/references/craft.md`, `motionreels/template/index.html`.
3. Send: "Follow SKILL.md to make a promo video of my app. Use craft.md as the rules and template/index.html as the starting file. Give me the finished index.html as a download."
4. Answer its questions and ask for the MP4. If it gives you an `index.html` instead, download it and record it as in step 4 above.

For the full-quality file with sound, run the same skill in Claude Code.

## Sound, and who owns it

By default the MP4 gets a music bed and sound effects that motionreels **generates from code** (`motionreels/scripts/audio.mjs`): no recording made by anyone else is used, so there is nothing to license from a third party. japsnap claims no rights in the generated audio; to the extent any exist, they are granted under the same MIT terms, no credit needed. The preview page and its Record button are silent.

If you add your own music (`render.mjs --audio music.mp3`), the skill first asks you to confirm you have the right to use that track in a public video. The skill is told never to download music, sound effects or meme clips. If you use a music library, check that track's own licence for your platform yourself.

No warranty: the software and its output come as is (see LICENSE). Nobody can promise a video will pass a platform's automated matching (YouTube Content ID, Instagram, TikTok) or draw no claim; what you publish, and any dispute about it, is yours.

## It remembers you, with your permission

When you tell it something that will matter next time (your language, "don't ask me for confirmations", "lots of meme-style sound effects", your product's colours), it asks once whether to remember it, and saves it only on your yes in `~/.motionreels/profile.json` on your own computer. Next time it applies those settings and tells you in one line. Say "forget ..." to remove one, or "show my settings" to see them all. motionreels itself sends it nowhere. Like everything the agent reads (your answers, screenshots, this profile), it passes through the AI provider you run the skill in, under that provider's terms.

The preview, the check and the render load fonts from Google Fonts, so they need an internet connection unless you put font files in the video folder.

You are responsible for the rights to what goes into a video: your screenshots, any music passed with `--audio`, and any other company's product you show. The skill shows other products by plain text name and layout, without logos.

## Commands the skill runs (you can run them too)

```sh
node ~/.claude/skills/motionreels/scripts/check.mjs  motionreels/my-video            # the slop gate
node ~/.claude/skills/motionreels/scripts/stills.mjs motionreels/my-video 0 1.5 3    # PNG frames to look at
node ~/.claude/skills/motionreels/scripts/render.mjs motionreels/my-video --all-langs  # MP4 per language
```

`render.mjs` takes `--audio music.mp3` to lay music under the picture.

## What is in the repo

- `motionreels/SKILL.md`: the instructions the agent follows.
- `motionreels/references/craft.md`: motion, type and structure rules, and the ban list.
- `motionreels/template/index.html`: the starting page with the time-driven runtime and a small example.
- `motionreels/scripts/`: `check.mjs`, `stills.mjs`, `render.mjs`, `lib.mjs` shared by them, and `test-record.mjs` (a maintainer test of the Record button).

Dependencies: [Puppeteer](https://pptr.dev) (drives headless Chrome), [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) (GPL-3.0: both the npm package and the FFmpeg binary it downloads at install. MIT covers only this repo's own files; anyone redistributing an installed copy takes on the GPL terms), [pngjs](https://github.com/pngjs/pngjs).

## 日本語

motionreels は、Claude Code と Codex で使える動画づくりのスキルです。アプリについていくつか質問し、サイトから実際の色・フォント・文言を読み取り、実際の画面をもとに短いモーショングラフィックス動画（機能紹介、ブランド紹介、使い方、ローンチ告知）を MP4 で書き出します。

- **会話はあなたの言語で。** 日本語で話しかければ、質問も確認もすべて日本語で、動画の文字も日本語になります。ほかの言語版がほしいときは頼めば同時に書き出せます。
- **音つき。** 音楽と効果音はコードで生成します。他人の音源は使わないので第三者の許諾は不要です。ただし公開先の音楽ルール（自動判定を含む）と、公開する内容の責任はご自身にあります。自分の音楽を使うときは、使う権利があるかを確認してから入れます。
- **あなたを覚えます（許可制）。** 「確認なしで作って」「効果音多めで」などを、許可をもらったときだけ、あなたのパソコンの `~/.motionreels/profile.json` に保存し、次回から反映します。
- **保証はありません。** ソフトと出力は現状のまま提供されます（LICENSE 参照）。動画が各プラットフォームの自動判定を通ることや、申し立てを受けないことは誰にも約束できません。公開する内容と、それに関する争いの責任はご自身にあります。
- **質問は一度にまとめて。** 答えたくない質問は飛ばして大丈夫です。飛ばした項目は決まった初期値で埋めるのではなく、サイト・画面・ほかの回答から毎回考えて決め、何をなぜ決めたかを伝えます。
- **動きの強さを選べます。** 落ち着いた（calm）、中くらい（medium）、強め（high）の3段階です。
- **最初に見た目を合わせます。** 動かす前に、流れの表と各場面の静止画を見せて確認します。直しは作ったものの上に重ね、毎回の版を残すので「前のに戻して」もできます。
- **Node.js がなくても使えます。** Claude Code なら、必要なときに Node.js のインストールをこちらの許可つきで提案します。claude.ai や ChatGPT で作った場合は、できた index.html を Chrome で開き「Record video」を押すと、画面の大きさの画質で MP4 が保存されます。
- **偽物の映像は作りません。** 動画生成モデルは使わず、あなたのアプリの実際の画面と色から、コードでアニメーションを組みます。
- **テンプレっぽさはスクリプトで止めます。** ぼかしの出現、3D回転、パーティクル、光るエフェクト、止まったままの冒頭、1秒以上止まる画面、長すぎる文字（日本語は1行16文字まで）、スマホで読めない小さな文字、インスタのボタンに隠れる位置の文字があると、書き出しを止めます。

使い方は上の「Use it」を見てください。Claude Code を開いて「アプリの紹介動画を作って」と頼むか、`/motionreels` と入力すれば始まります。

## License

MIT
