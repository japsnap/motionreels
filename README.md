# motionreels

A skill for Claude Code and Codex that interviews you about your app, reads your site, and makes a short motion-design video of your real product: a one-feature intro, a brand promo, a walkthrough or a launch cut. It talks to you in your language (Japanese and English fully supported) and renders an MP4.

Made with Claude Opus 5.5.

**日本語の説明は下にあります。**

## Why it looks sharp instead of generic

- **Your real product.** The skill reads your site's actual colours, fonts and wording, and rebuilds your real screens from your screenshots. It is told never to generate fake footage or invent UI your app does not have; the script cannot check that, so look at the stills.
- **Code, not a video model.** The video is one HTML page animated by time and recorded frame by frame, so every frame is exact and every note ("make the chart slower") is a one-line fix.
- **Slop is blocked by a script.** `scripts/check.mjs` refuses to render when it finds blur-ins, 3D flips, particles, glow, a still opening, a picture held for over about a second, lines over 8 words (16 characters in Japanese), text too small for a phone, or text under Instagram's buttons. The rules it cannot check by machine (crossfades, generic icons, invented UI) are written in `motionreels/references/craft.md` for the agent to follow.
- **Built for the first three seconds.** Short-video platforms rank on how many people swipe away in the first 3 seconds, so frame 0 must already be moving and show something specific.

## How a session goes

1. You say "make a promo video for my app" (or 「アプリの紹介動画を作って」).
2. It sends all its questions in one message: URL, what kind of video, the one takeaway, the viewer's pain, screenshots, platform, length, on-screen language, brand rules, end card, sound, styles you like. Skip any; it fills sensible defaults and tells you what it assumed.
3. It reads your site and screenshots, then shows you a beat sheet (time, picture, words, motion) for a yes.
4. It builds the video, checks it, looks at stills of every beat, and gives you a preview page with Play, Replay, a scrubber and a language picker.
5. You give notes in plain words until you like it.
6. It renders the MP4 (one per on-screen language) and verifies the file.

## Install

Needs [Node.js](https://nodejs.org) 18 or newer and Git. The first run downloads a headless Chrome and an FFmpeg binary (about 200 MB, one time).

**Claude Code, macOS or Linux**

```sh
git clone https://github.com/japsnap/motionreels
cp -r motionreels/motionreels ~/.claude/skills/
cd ~/.claude/skills/motionreels && npm install
```

**Claude Code, Windows PowerShell** (run one line at a time)

```powershell
git clone https://github.com/japsnap/motionreels
Copy-Item -Recurse motionreels\motionreels $HOME\.claude\skills\
cd $HOME\.claude\skills\motionreels; npm install
```

**Codex**: the same, with `~/.codex/skills/` in place of `~/.claude/skills/`.

**claude.ai (chat)**: zip the inner `motionreels` folder and upload it under Settings, Capabilities, Skills. In the chat app the skill runs the interview and builds the preview page as an artifact, but it cannot run the check or render the MP4; use Claude Code or Codex for the file.

Then open Claude Code in your project and ask for a video, or type `/motionreels`.

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
- `motionreels/scripts/`: `check.mjs`, `stills.mjs`, `render.mjs`, and `lib.mjs` shared by them.

Dependencies: [Puppeteer](https://pptr.dev) (drives headless Chrome), [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) (GPL-3.0: both the npm package and the FFmpeg binary it downloads at install. MIT covers only this repo's own files; anyone redistributing an installed copy takes on the GPL terms), [pngjs](https://github.com/pngjs/pngjs).

## 日本語

motionreels は、Claude Code と Codex で使える動画づくりのスキルです。アプリについていくつか質問し、サイトから実際の色・フォント・文言を読み取り、実際の画面をもとに短いモーショングラフィックス動画（機能紹介、ブランド紹介、使い方、ローンチ告知）を MP4 で書き出します。

- **会話はあなたの言語で。** 日本語で話しかければ、質問も確認もすべて日本語です。動画内の文字の言語は別に選べて、日本語版と英語版を同時に書き出せます。
- **質問は一度にまとめて。** 答えたくない質問は飛ばして大丈夫です。空いたところは標準の設定で埋め、何を仮定したかを伝えます。
- **偽物の映像は作りません。** 動画生成モデルは使わず、あなたのアプリの実際の画面と色から、コードでアニメーションを組みます。
- **テンプレっぽさはスクリプトで止めます。** ぼかしの出現、3D回転、パーティクル、光るエフェクト、止まったままの冒頭、1秒以上止まる画面、長すぎる文字（日本語は1行16文字まで）、スマホで読めない小さな文字、インスタのボタンに隠れる位置の文字があると、書き出しを止めます。

インストール方法は上の Install を見てください（Node.js 18 以上が必要です）。Claude Code を開いて「アプリの紹介動画を作って」と頼むか、`/motionreels` と入力すれば始まります。

## License

MIT
