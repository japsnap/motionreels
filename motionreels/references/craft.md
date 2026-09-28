# Craft rules for motionreels

What makes a product video look like a studio made it rather than a template: the real product on screen, one idea, continuous motion, and nothing decorative. Each rule below is marked CHECKED when `scripts/check.mjs` enforces it, or JUDGED when you must hold it yourself.

## The first three seconds

Short-video platforms count a "skip" when a viewer swipes away inside the first 3 seconds, and they rank on it. A 71 second launch reel that opened on a still text card lost 79% of its views there and was watched for 11 seconds on average; that is the failure these rules exist for.

- Frame 0 is already in motion and already shows something specific: the product doing the thing, or the pain happening. CHECKED (motion within 0.3 s, frame 0 not flat).
- No logo intro, no title card, no "Introducing". The name comes at the end. JUDGED.
- By 1.5 s the viewer knows what the video is about, from the picture more than the words. JUDGED.
- The opening is the most energetic stretch of the video at any intensity: a hit on every beat (a line slamming in, a punch-in, a new element), and a payoff moment near 2 s (a squash-and-stretch pop, a snap into the product). A tidy opening is a skipped opening. JUDGED.

## Structure by type (seconds are for a 15 to 20 s cut)

- **One feature**: 0 to 2 the pain or the result, mid-action · 2 to 12 the feature working in the real UI, cursor-driven, two or three quick steps · 12 to 15 the payoff (the saved thing, the number, the finished state) · last 1.5 to 2 end card.
- **Brand promo**: 0 to 2 a striking moment of the product in use · three beats of about 3 s, each a different real screen, each morphing out of the last · one line of what the brand stands for · end card.
- **Walkthrough**: the same as one feature, with at most four steps and a small step counter.
- **Launch**: open on the new thing itself, then one line of what changed, then two proof beats, then the date or URL.

One idea per video. A second idea is a second video.

- **Depth beats breadth.** Show one hero flow completely and slowly enough to follow (each step readable), then fold every alternative (other platforms, other integrations, other plans) into ONE screen near the end: "Works the same in X, Y and Z." Four equal quick demos read as a list and teach nothing. JUDGED.
- **The example is content.** Pick the demo's example (the word, the file, the number) so this viewer feels something: surprise, recognition, a laugh, a "there's a word for that?". Never a placeholder like "Hello" or "Task 1". JUDGED.
- **Say how much setup it takes.** If the feature needs setup, one honest line ("Set up once in each app") and a pointer to where the steps live; the steps themselves belong in an article, not the video. JUDGED.

## Motion intensity (asked in the interview; set as `intensity` in `MR.config`)

| | calm | medium | high |
|---|---|---|---|
| something new happens | about every 1 s | every 0.5 s beat | every 0.25 to 0.5 s |
| easing | out, no overshoot | springs, overshoot up to 8% | springs and back-eases, overshoot up to 15% |
| camera | slow drift and push | a punch-in (4 to 8%) on each key moment | punch-ins on most beats, quick pans between moments |
| accents | none | one squash-and-stretch at the main transition, counters that tick | squash-and-stretch, kinetic type slams, counters, speed ramps |
| longest still picture mid-video | 1.6 s (CHECKED) | 1.2 s (CHECKED) | 0.8 s (CHECKED) |

Energy comes from timing, scale and position, never from the banned effects. Even at high, reading time wins: a line stays up long enough to read. When the user skips this question, decide from the product and platform (a playful consumer app on Reels leans medium to high; a finance or B2B product on a website leans calm to medium) and say what you chose.

## Motion

- Continuity: objects morph into the next scene (a button grows into the next panel, a card flies into a list) instead of cutting or fading. A shape that never leaves the screen and keeps becoming the next element is the strongest version. JUDGED.
- A cursor drives real actions: moves on a curve, presses (scale 0.94 then back), types at a human pace (12 to 20 characters a second), drags. JUDGED.
- Camera: push in so each moment fills the frame, like a screen-recording zoom, then pull back or pan to the next moment. JUDGED.
- Timing: land actions on a 0.5 s grid (120 BPM) so music can be laid under later. Springs and expo-out eases (`E.spring`, `E.expo`, `E.out` in the runtime); linear only for camera drift. JUDGED.
- Always something moving. No still picture longer than the intensity allows mid-video, and at most 2 s on the end card. CHECKED.
- Exits move: an element leaves by sliding, scaling into the next thing, or being wiped by a mask, not by fading out in place. JUDGED.

## Banned (template slop)

CHECKED in the source: blur and blur-ins; 3D flips and perspective; particles, confetti, sparkles; glow (shadows with no offset and a big spread); CSS transitions and keyframes (they also break the frame-by-frame render); `Math.random`; timers; stock image sites; embedded video.

JUDGED, because a script cannot see them reliably: crossfades between scenes; floating blobs, abstract gradients and generic icons standing in for the product; invented UI that the product does not have; lens flares, light leaks, film grain; kinetic text that bounces letter by letter; more than one accent colour; fake metrics or testimonials; people or faces the user did not supply.

## Words on screen

- One line at a time, 8 words or fewer (16 characters or fewer in Japanese, Chinese or Korean). CHECKED.
- Big: at least 4% of the frame width, usually 7 to 10% for a message line. CHECKED (the minimum).
- Readable text stays out of the platform's button areas: on 9:16, the top 12% and bottom 22% and 6% at the sides. CHECKED (after half a second outside).
- Every line stays on screen long enough to read: 0.5 s plus 0.22 s a word, or 0.12 s a character in Japanese, Chinese or Korean. CHECKED.
- One type size per beat. A longer line wraps to a second line; it never shrinks to fit. JUDGED.
- A card or list that grows is pinned at its top, so it grows downward and does not jump. A column that is sometimes empty keeps its width. JUDGED.
- Words the user did not approve (prices, "free", claims, superlatives) do not appear. JUDGED.
- Say the benefit in the viewer's words, not the feature's name. JUDGED.

## Languages and scripts

- The on-screen language is the user's language unless they ask for others. Extra languages, romanization under foreign words, or a particular script style are the user's house rules: follow them when asked or saved in the profile, never by default. JUDGED.
- Every script on screen gets a loaded font, never a system fallback, set at a size where it reads as large as its Latin neighbours; right-to-left text gets `dir="rtl"`. Some scripts need a specific style (Urdu is normally written in Nastaliq, which draws small and tall: set it about 1.2 times larger with extra line height). JUDGED.
- Multilingual examples must be correct: check each translation and romanization against a dictionary, and avoid cognates when the point is how languages differ. JUDGED.

## Colour, type, assets

- Use the site's real tokens and fonts. One accent colour; the rest are the brand's neutrals. JUDGED.
- A script that the default font draws badly gets a loaded font file (Urdu needs a Nastaliq font file; Japanese needs Noto Sans JP or the brand's JP face). JUDGED.
- Flag emoji do not render on Windows; use small image files for flags. JUDGED.
- Recreate UI in HTML/CSS at a legible scale: the real screen is usually too dense for a phone video, so keep the real layout, colours and labels and drop the chrome. Mark every recreated screen `data-ui`. JUDGED.
- Show other companies' products (a chat app, an editor) by their plain text names and a faithful layout, without their logos. JUDGED.

## End card

The product name or mascot and one line: the URL or handle. Visible for 1.5 to 2 s with a slow push so it is not a still. If the video should loop, make the last frame lead back into the first. JUDGED.

## Before you call it done

`check.mjs` passes for every language; you looked at a still of every beat; the user saw the preview; `render.mjs` printed OK with the size and duration read back from the file.
