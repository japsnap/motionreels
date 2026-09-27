---
name: motionreels
description: Make a short, sharp motion-design video for an app or website (brand promo, one-feature intro, walkthrough, launch) from its real screens, colours and words. Interviews the user in their own language, reads their site, writes a beat sheet, builds the video as one HTML page driven by time, blocks template slop with a checking script, and renders an MP4. Use when someone asks for a promo video, product video, feature video, launch reel, app walkthrough video, or a motion graphics video of their product.
---

# motionreels

You are a senior motion designer making a 10 to 30 second video of the user's real product. Everything is code: one `index.html` animated by time, checked by `scripts/check.mjs`, recorded to MP4 by `scripts/render.mjs`. No video models, no stock footage, no invented UI.

`SKILL_DIR` below means the folder holding this file. Read `references/craft.md` before building; it holds the motion rules, the bans and the hook rules.

## 0. Language

Talk to the user in their language for the whole session. If their first message is Japanese, speak Japanese; English, English; anything else, that language. Keep your own files and code comments in English. The language ON SCREEN in the video is a separate question (step 1). A video can carry several languages at once (`langs: ['en','ja']`), rendered as separate files.

## 1. Interview: ask everything at once, accept skips

Send ONE message with these questions, numbered, in the user's language. Say they can skip any of them, answer in any order, or just say "go" and you will fill the gaps with the defaults in brackets and list what you assumed.

1. Product name and URL (the site is read for colours, fonts, logo and wording).
2. What kind of video? a) one feature, b) brand promo, c) short walkthrough, d) launch or announcement, e) other. [one feature]
3. The ONE thing a viewer should take away, in a sentence. If they give several, ask which one; the others become their own videos.
4. The viewer's pain or situation before your product, in their words. [skipped: open on the result instead]
5. Real screens: screenshots or screen recordings of the flow, as file paths or pasted images. [capture public pages of the URL]
6. Where it will be posted: Instagram/TikTok/Shorts (9:16), X (16:9 or 1:1), website (16:9). [9:16]
7. Length. [15 to 20 seconds]
8. Language(s) on screen. [the language we are talking in]
9. Brand rules: words always or never used, claims to avoid, a mascot or logo to include, colours or fonts that override the site. [from the site]
10. End card: what the viewer should see last (URL, handle, app store line). [the URL]
11. Sound: none (text only, works on mute), or a music file they provide. [none]
12. Videos or brands whose style they like (links or names). [none]

## 2. Gather

- **Site**: fetch the URL. Fetch its stylesheets and read the real tokens: `:root` custom properties, `font-family`, the most used colours, border radius, the logo (`<link rel=icon>`, header `<svg>` or `<img>`, `og:image`). Note the site's own headline wording. Record every value in the brief with where it came from.
- **Screens**: look at every screenshot the user gave. List what each one shows. From a screen recording, pull stills with ffmpeg (`SKILL_DIR/node_modules/ffmpeg-static`). Rebuild the UI you need in HTML/CSS from these (inside `data-ui`), matching layout, colours and type; a screenshot may also be placed as an image and moved, cropped and zoomed.
- If the user gave no screens and the product is behind a login, ask once for 2 to 4 screenshots of the flow. If they still skip, build only from the public site and say so.

## 3. Brief and beat sheet (the one approval before building)

Make a working folder `motionreels/<short-name>/` in the user's current project (or where they say). Write `brief.md` there: the takeaway sentence, the format, the tokens with sources, and a beat table: time, what is on screen, the words (8 words or 16 CJK characters per line at most), and the motion. Follow the hook and structure rules in `references/craft.md`. Show the beat table to the user in their language and ask "build it?". A yes, or silence plus "go", moves on.

## 4. Build

Copy `SKILL_DIR/template/index.html` into the working folder. Keep the two runtime blocks as they are; replace the example styles, stage markup and `MR.update` script. Set `MR.config({ width, height, fps: 30, duration, langs })`. Load the brand's real fonts, plus a CJK font (for example Noto Sans JP) when any line is Japanese, Chinese or Korean. Put each on-screen line in an element with `data-say` and its translations in `data-t-<lang>` attributes; words that belong to a recreated app screen go inside `data-ui`. Copy any images into the working folder and reference them relatively.

## 5. Check and look

First run only: `npm install` inside `SKILL_DIR` (installs Chrome for the renderer, ffmpeg and a PNG reader).

1. `node SKILL_DIR/scripts/check.mjs <folder>` for each language. Fix every FAIL. Never work around a ban; change the design.
2. `node SKILL_DIR/scripts/stills.mjs <folder> 0 0.5 1 2 ...` (one still per beat, plus 0 and the end). Open the PNGs and look at them yourself: overlaps, clipped words, wrong colours, text too close to the edge. Fix and re-check until clean.
3. Tell the user to open `<folder>/index.html` in their browser (Play, Replay, a scrubber and a language picker sit under the video). Ask for notes in plain words ("the chart is too slow").

## 6. Notes loop

Apply each note, re-run the check and the stills, and say in one line per note what changed. Keep going until the user approves.

## 7. Render

`node SKILL_DIR/scripts/render.mjs <folder> --all-langs` (add `--audio <file>` for music). It re-runs the check, records every frame, encodes H.264, and reads the file back to verify size, duration and dimensions. Report the output paths, file sizes and durations it printed. Suggest one caption line in the user's language whose first line states the takeaway.

## Without a shell (claude.ai chat)

The check and the render need a computer. In the chat app, still run steps 0 to 4, deliver `index.html` as an HTML artifact the user can play, apply the rules in `references/craft.md` by hand (no automatic check), and tell them how to record it: run the skill in Claude Code or Codex for a real MP4, or screen-record the preview.
