# Icon design: illustrations for word cards and comparison sets

How to draw the icons in a video that teaches or compares: word cards, and sets of items that share a meaning and differ in one way (one idea in three registers, three near-synonyms, three plans). `craft.md` holds the one-line rule; this file holds the method, the research behind it, the drawing spec and the checks.

## 1. What the research says

There is no study that tests this exact format (three near-synonyms differing in register, each with an icon). The method below is inferred from adjacent, well-established research.

1. **Pictures that carry meaning help; decorative pictures do not.** Carney & Levin (2002, *Educational Psychology Review* 14(1)) classify text illustrations as representational, organisational, interpretational, transformational and decorative. Decorative pictures are the type most associated with no gain or a loss; the others improve learning from text.
   *Consequence:* a generic category icon (a quill for "poetic", a book for "literary") is decorative here, because the label already says it. Do not use it.

2. **Exclude extraneous material, and signal what matters.** Mayer's coherence principle: people learn better when extraneous words, pictures and sounds are excluded. His signalling principle: people learn better when cues highlight the organisation of the essential material.
   *Consequence:* each icon contains only what teaches. Repeating a shared motif across a set is a signalling cue ("these mean the same thing"); the element that changes is the cue for the difference.

3. **Similar items learned together interfere; distinctiveness helps.** Tinkham (1993, 1997) and Waring (1997) found that presenting semantically similar new words together can slow learning, because similar memory traces compete. Nation adds that related sets suit learners whose knowledge is already established better than initial learning.
   *Consequence:* the shared motif must stay secondary. The distinguishing context must be the dominant, clearly different element, so the icons are easy to tell apart at a glance.

4. **Pictures help abstract words too.** Farley, Ramonda & Liu (2012, *Language Teaching Research* 16(4)) report better meaning recall for abstract L2 words when paired with pictures, and later studies point the same way.
   *Consequence:* abstract words (beautiful, beloved, gaze) still deserve a meaningful picture, not a skipped or generic one.

5. **Pictures aid meaning but can pull attention from the word's form.** Boers, Piquer-Píriz, Stengers & Eyckmans (2009, *Language Teaching Research* 13(4)) found pictorial elucidation contributed little to retention of form and could distract with difficult words. Boers, Warren, Grimshaw & Siyanova-Chanturia (2017, *Computer Assisted Language Learning*) argue that pictures mainly work by attracting attention.
   *Consequence:* the word stays the largest element on the card; the icon is supporting and smaller.

6. **Pictures of a specific scene can overspecify.** Work on pictures for idioms reports that pictures with metonymic elements led learners to overspecify meaning.
   *Consequence:* an icon of the example sentence ("a flower" for *pretty*) risks teaching "pretty = flowers". Prefer the word's core meaning; use the example only when it is the clearest representation of that meaning.

## 2. The approach this supports

A **shared motif plus the distinguishing context**, with two refinements from point 3 and point 5:

- **Shared motif (secondary):** the core meaning all items share. It appears in every icon of the set, smaller or lighter, in the same style and position.
- **Distinguishing element (dominant):** what makes this item different. That is its own meaning if the items mean different things, or its context of use if they mean the same thing.
- **Not allowed:** generic category icons, decorative scenes, and pictures of the example sentence that do not show the word's meaning.

## 3. Decision procedure for each set

1. **Name the shared meaning in one word** (rain, love, eye, globe, house). This becomes the motif.
2. **For each item, write one line: "different because ___".**
   - If the blank is a *different thing or form* (passing shower vs forecast rain), draw that thing, built from the motif.
   - If the blank is *who says it, where, or in what medium* (to elders; in letters; in poetry; in the news), draw the context object next to the motif: a phone for texts, a letter for writing, an open book for literary use, a quill for poetry, a newspaper for formal or news use, a speech bubble for everyday talk, a traditional tray for old-style hospitality.
   - If the blank is *intensity or quality* (pretty, exquisite, resplendent), vary the motif itself: more detail, more light, more scale.
3. **Example sentences may decide the icon only if** the example is a direct, typical instance of the meaning (a concrete noun), not an incidental scene.
4. **Never show the same object the same way twice in a set.**
5. **Avoid depicting people when an object can carry the context.** Small human figures and "old person" cues are hard to read at phone size and invite stereotypes.

## 4. Drawing specification

- **Format:** inline SVG, `viewBox="0 0 300 260"`, transparent background, no text inside icons.
- **Style:** line icons. Ink stroke 6 px (detail 4 to 5 px), round caps and joins. Brand accent colour for at most one filled highlight per icon. Secondary colour for the motif.
- **Composition:**
  - Distinguishing element takes about 55 to 70% of the visual weight; the motif about 30 to 45%.
  - Keep 12 px clear of the viewBox edge.
  - Each icon must read at 120 px wide.
- **Animation hooks:** every stroke path has `class="dr" pathLength="1"` (drawn on with `stroke-dashoffset`). Every fill has `class="fillin" data-o="<opacity>"` (faded in). Do not use `stroke-dasharray` for decoration; the draw-on animation overrides it.
- **Build from a shared component library** (`heart()`, `globe()`, `eye()`, `house()`, `bowl()`, `sparkle()`, `quill()`, `book()`, `phone()` and so on), so motifs are identical across a set and across a series.

## 5. QA before showing the user

1. **Thumbnail test:** at 64 px in greyscale, can each icon of the set be told apart?
2. **Pareidolia test:** look for accidental faces. Two round dots above an arc read as a face; a paw print inside a circle and a bowl with hands below both did.
3. **Overspecification test:** cover the label. Would a viewer guess the word's meaning, or only the example scene?
4. **Edge test:** nothing crosses the viewBox edge, and nothing touches the card's text when placed in the scene.
5. **Draw-on test:** render a still mid-draw and one fully drawn; fills appear after strokes.

## 6. Preview

Before any render, write one line per item (shared meaning, then "different because ___") and build one HTML preview page: one section per set, the icons side by side with word, register and example, the current version faded beside any replacement. Revise only the icons the user names; render only approved sets (`SKILL.md`, Changes).

## References (as cited above)

- Carney, R. N., & Levin, J. R. (2002). Pictorial illustrations still improve students' learning from text. *Educational Psychology Review*, 14(1), 5-26.
- Mayer, R. E. (2020). *Multimedia Learning* (3rd ed.). Cambridge University Press. Coherence and signalling principles.
- Tinkham, T. (1993). The effect of semantic clustering on the learning of second language vocabulary. *System*, 21(3). Tinkham, T. (1997). The effects of semantic and thematic clustering on the learning of second language vocabulary. *Second Language Research*, 13(2).
- Waring, R. (1997). The negative effects of learning words in semantic sets. *System*, 25(2).
- Farley, A. P., Ramonda, K., & Liu, X. (2012). The concreteness effect and the bilingual lexicon: The impact of visual stimuli attachment on meaning recall of abstract L2 words. *Language Teaching Research*, 16(4).
- Boers, F., Piquer-Píriz, A. M., Stengers, H., & Eyckmans, J. (2009). Does pictorial elucidation foster recollection of idioms? *Language Teaching Research*, 13(4), 367-382.
- Boers, F., Warren, P., Grimshaw, G., & Siyanova-Chanturia, A. (2017). On the benefits of multimodal annotations for vocabulary uptake from reading. *Computer Assisted Language Learning*, 30(7), 709-725.
