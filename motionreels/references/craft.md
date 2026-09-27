# Craft rules for motionreels

What makes a product video look like a studio made it rather than a template: the real product on screen, one idea, continuous motion, and nothing decorative. Each rule below is marked CHECKED when `scripts/check.mjs` enforces it, or JUDGED when you must hold it yourself.

## The first three seconds

Short-video platforms count a "skip" when a viewer swipes away inside the first 3 seconds, and they rank on it. A 71 second launch reel that opened on a still text card lost 79% of its views there and was watched for 11 seconds on average; that is the failure these rules exist for.

- Frame 0 is already in motion and already shows something specific: the product doing the thing, or the pain happening. CHECKED (motion within 0.3 s, frame 0 not flat).
- No logo intro, no title card, no "Introducing". The name comes at the end. JUDGED.
- By 1.5 s the viewer knows what the video is about, from the picture more than the words. JUDGED.

## Structure by type (seconds are for a 15 to 20 s cut)

- **One feature**: 0 to 2 the pain or the result, mid-action · 2 to 12 the feature working in the real UI, cursor-driven, two or three quick steps · 12 to 15 the payoff (the saved thing, the number, the finished state) · last 1.5 to 2 end card.
- **Brand promo**: 0 to 2 a striking moment of the product in use · three beats of about 3 s, each a different real screen, each morphing out of the last · one line of what the brand stands for · end card.
- **Walkthrough**: the same as one feature, with at most four steps and a small step counter.
- **Launch**: open on the new thing itself, then one line of what changed, then two proof beats, then the date or URL.

One idea per video. A second idea is a second video.

## Motion

- Continuity: objects morph into the next scene (a button grows into the next panel, a card flies into a list) instead of cutting or fading. A shape that never leaves the screen and keeps becoming the next element is the strongest version. JUDGED.
- A cursor drives real actions: moves on a curve, presses (scale 0.94 then back), types at a human pace (12 to 20 characters a second), drags. JUDGED.
- Camera: push in so each moment fills the frame, like a screen-recording zoom, then pull back or pan to the next moment. JUDGED.
- Timing: land actions on a 0.5 s grid (120 BPM) so music can be laid under later. Springs and expo-out eases (`E.spring`, `E.expo`, `E.out` in the runtime); linear only for camera drift. JUDGED.
- Always something moving. No still picture longer than about 1.2 s mid-video, and at most 2 s on the end card. CHECKED.
- Exits move: an element leaves by sliding, scaling into the next thing, or being wiped by a mask, not by fading out in place. JUDGED.

## Banned (template slop)

CHECKED in the source: blur and blur-ins; 3D flips and perspective; particles, confetti, sparkles; glow (shadows with no offset and a big spread); CSS transitions and keyframes (they also break the frame-by-frame render); `Math.random`; timers; stock image sites; embedded video.

JUDGED, because a script cannot see them reliably: crossfades between scenes; floating blobs, abstract gradients and generic icons standing in for the product; invented UI that the product does not have; lens flares, light leaks, film grain; kinetic text that bounces letter by letter; more than one accent colour; fake metrics or testimonials; people or faces the user did not supply.

## Words on screen

- One line at a time, 8 words or fewer (16 characters or fewer in Japanese, Chinese or Korean). CHECKED.
- Big: at least 4% of the frame width, usually 7 to 10% for a message line. CHECKED (the minimum).
- Readable text stays out of the platform's button areas: on 9:16, the top 12% and bottom 22% and 6% at the sides. CHECKED (after half a second outside).
- One type size per beat. A longer line wraps to a second line; it never shrinks to fit. JUDGED.
- A card or list that grows is pinned at its top, so it grows downward and does not jump. A column that is sometimes empty keeps its width. JUDGED.
- Words the user did not approve (prices, "free", claims, superlatives) do not appear. JUDGED.
- Say the benefit in the viewer's words, not the feature's name. JUDGED.

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
