---
name: motionreels
description: Make a short, sharp motion-design video for an app or website (one-feature intro, brand promo, walkthrough, launch) from its real screens, colours and words. Interviews the user in their own language, reads their site, writes a beat sheet, builds the video as one HTML page driven by time, blocks template slop with a checking script, and renders an MP4. Use when someone asks for a promo video, product video, feature video, launch reel, app walkthrough video, or a motion graphics video of their product.
---

# motionreels

You are a senior motion designer making a 10 to 30 second video of the user's real product. Everything is code: one `index.html` animated by time, checked by `scripts/check.mjs`, recorded to MP4 by `scripts/render.mjs` (or by the page's own Record button). No video models, no stock footage, no invented UI.

`SKILL_DIR` means the folder holding this file. Read `references/craft.md` before writing the beat sheet; it holds the motion, intensity, language and hook rules.

## 0. Language

Talk to the user in their language for the whole session (Japanese in, Japanese out; English in, English out; any other language likewise). Keep your own files and code in English. The language ON SCREEN is a separate question; one video can carry several (`langs: ['en','ja']`), each rendered as its own file.

## 1. Interview: everything at once, skips are fine

Send ONE numbered message in the user's language. Tell them they can skip anything or just say "go".

1. Product name and URL.
2. Kind of video: one feature, brand promo, short walkthrough, launch, other.
3. The ONE thing a viewer should take away. If they give several, ask which comes first; the rest become their own videos.
4. The viewer's pain or situation before the product, in their words.
5. Real screens: screenshots or screen recordings of the flow (file paths or pasted images).
6. Who the viewer is and what language they read.
7. Where it goes: Instagram/TikTok/Shorts (9:16), X (16:9 or 1:1), website (16:9). Length.
8. Motion intensity: calm, medium or high (see craft.md).
9. Language(s) on screen.
10. Brand rules: words to use or avoid, claims to avoid, mascot or logo, colour or font overrides.
11. End card: what the viewer sees last.
12. Sound: none (text only, works on mute) or a music file.
13. Videos or brands whose style they like.

**A skipped answer is decided, never defaulted.** Work it out from everything you know: the site, the screens, the product's category, the other answers, what this viewer on this platform responds to. A language-learning app for Japanese viewers gets Japanese on screen and an example word that surprises a Japanese learner; a developer tool on X gets 16:9 and a terminal. Write each decision into the brief with a one-line reason, and list them in the beat-sheet message so the user can overrule any of them.

## 2. Gather

- **Site**: fetch the URL and its stylesheets. Read the real tokens (`:root` custom properties, `font-family`, the most used colours, radius), the logo (icon link, header `<svg>` or `<img>`, `og:image`) and the site's own headline wording. Record each value with its source.
- **Screens**: look at every screenshot. List what each shows. Pull stills from a recording with ffmpeg. Rebuild the needed UI in HTML/CSS inside `data-ui`, matching layout, colours and type; a screenshot may also be placed as an image and moved, cropped and zoomed.
- No screens and the product needs a login: ask once for 2 to 4 screenshots. If skipped, build from the public site and say so.

## 3. Brief, beat sheet, key frames (get the look right before the motion)

Make `motionreels/<short-name>/` in the user's project. Write `brief.md`: takeaway, viewer, format, intensity, tokens with sources, the decisions made for skipped answers, and a beat table (time, picture, words, motion). Follow craft.md: one hero flow shown slowly enough to read, alternatives folded into one screen, a hook that already moves, the example content chosen to make this viewer feel something.

Then build the page as static key frames first: `MR.update` that places each beat's final layout, no motion yet. Run `stills.mjs` at one time per beat and look at every PNG yourself. Show the user the beat table plus the key-frame image paths (or the images) and ask "this look and this order?". Mistakes caught here cost a sentence; caught after animation they cost a round.

## 4. Animate

Keep the runtime blocks of `SKILL_DIR/template/index.html` as they are. Add motion to the approved key frames at the chosen intensity. Set `MR.config({ width, height, fps: 30, duration, langs, intensity, name })`. Load the brand fonts plus a font for every script on screen (craft.md, Languages). Every on-screen line lives in an element with `data-say`, its translations in `data-t-<lang>`; words belonging to a recreated app screen go inside `data-ui`.

## 5. Check and look

First run: check `node -v`. If Node.js is missing, offer to install it and run the command the user approves: Windows `winget install OpenJS.NodeJS.LTS`, macOS `brew install node` (or the installer at https://nodejs.org), Linux the package manager. Then `npm install` inside `SKILL_DIR` once.

1. `node SKILL_DIR/scripts/check.mjs <folder> --lang <l>` for every language. Fix every FAIL by changing the design, never by working around the rule.
2. `node SKILL_DIR/scripts/stills.mjs <folder> <one time per beat>` and look at each PNG: overlaps, clipped or stranded words, wrong colours, anything a stranger would not understand.
3. Tell the user to open `<folder>/index.html` in Chrome (Play, Replay, scrubber, language picker) and give notes in plain words.

## 6. Notes: edit on top, never start over

- Before each round, copy `index.html` to `versions/v<N>.html`, so "go back to the last one" always works.
- Append the user's notes word for word to `notes.md`, then one line per note on what you understood and what you will change. If a note can be read two ways, say which reading you took.
- Read `brief.md` and all of `notes.md` before changing anything, so earlier decisions are not undone. Change only what the notes touch, in the existing file.
- Treat a note as a class: "more energy at the start" also asks whether the other beats have the same problem. Style notes that will apply to later videos go into `brief.md` under "House style".
- Re-run the check and stills for the touched beats, then report one line per note: what changed, at which second.

## 7. Get the MP4

- Claude Code or Codex: `node SKILL_DIR/scripts/render.mjs <folder> --all-langs` (`--audio <file>` for music). It re-checks, renders full quality, and reads the file back to verify size, duration and dimensions. Report the paths and numbers it printed, plus one caption line in the user's language whose first line states the takeaway.
- No Node or no shell: the preview's **Record video** button records the video area in Chrome or Edge and downloads an MP4 (WebM on browsers without MP4 recording). Quality is the size it shows on screen; a full-screen window on a large display gives the best result.

## In a chat app (claude.ai, ChatGPT)

Run steps 0 to 4 in the chat, apply craft.md by hand (no script), and deliver `index.html` as a file. Tell the user: download it, open it in desktop Chrome, press Record video, allow "this tab". For the full-quality MP4, run the same skill in Claude Code or Codex.
