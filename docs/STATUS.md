# Debate Workbench 0.2: status

Updated Nov 7, 2026, end of stage 1 (core). Branch `v0.2`, not pushed. Packet: `claude-test/.planning/hackathon-2026-11/debate-workbench/` (SPEC.md, DESIGN.md). Build deadline: Monday Nov 9, 6 PM CT.

**Tests: 123, all passing** (`/usr/bin/python3 -m unittest discover -s tests`, about 1.5 s): speech 21, headlines 16, extemp 12, rhetoric 12, ballots 7, manifest and bundle 6, plus 0.1's 49. The desktop bundle is current (`node ~/products/hermes-ui-kit/scripts/build.mjs . --check`). The draft catalog entry passes Hermes's `validate_plugin_catalog.py` (run with a scratch HOME). gitleaks: no leaks on any commit.

## What works now

End to end in the harness, with the real backend code under the tests:

1. **The frame.** Event rail (Lincoln-Douglas, Extemp, Rhetoric, Ballots), the strip drawn to scale in time, the 190px condensed clock with the timekeeper's cards (7..1, 30, Time). The page opens on Extemp with a 60-second answer loaded and ready to speak (the cross-set fix: the speaking state is the default screen and the catalog image, `docs/shots/v02/extemp-speaking-dark.png`). Corners follow the host's radius; nothing under 12px; 0.1's 10 and 11px labels raised.
2. **The recorder** (M2). MediaRecorder plus an analyser at 20 Hz, kept at 10 Hz. The clock starts at the first sound. Auto-stop 60 s past time, or after 2 minutes of silence. Mic denied, missing, busy, unsupported, broken mid-take and never answering (15 s timeout) each have a plain message; "Type instead" always works and is labeled "estimated at 140 words a minute". Verified with Chrome's fake microphone over the DevTools protocol (`harness/live.mjs`): the clock ran 1:00 to 0:55, the take uploaded, the floor showed its numbers, no page errors.
3. **Takes and transcripts** (M3). `speech.py`: upload through ctx.rest's single-file upload with a base64-in-JSON fallback; 30 MB cap, audio MIME check, atomic write; newest 20 recordings and 100 MB kept; delete-all. faster-whisper runs in one worker thread when installed (base.en default, small.en offered, unloaded after 5 idle minutes); otherwise the take is marked "Timing only" and keeps its recording for "Transcribe now". "Type what you said" gives real timing plus the student's words. Speaking time and pauses over 2 s come from the levels; words a minute, fillers ("fillers the transcript caught") and time to the answer from the transcript.
4. **Extemp** (M7, M8, M9, M10). The 60-second answer floor, judged; the full round: Pull headlines (10 outlets in parallel, each column failing alone, cache per topic, offline falls back to the last pull), Save to file, Draw three questions from the file and this pull (model), with a write-your-own fallback when the model fails or answers badly (no model needed), 30:00 prep with the outline and file sources, 7:00 speech, ballot.
5. **The ballot sheet** (M5, extemp and drill). Answered Yes / Partly / No boxes and the points circle in the user's accent (the judge's pen), the decisive lines in the student's own words (serif) checked against the transcript ("Not found in your transcript. Check it." when not), one DRILL, the reason folded with its word count computed.
6. **Ballot tags and patterns** (M6). Fixed tag lists per event; off-list tags dropped. Measured tags from numbers only (pace over 175 or under 115, over time past a 5 s grace, under three quarters of the time, late answer, fillers over 4 a minute, three or more long pauses). The Ballots view counts "N of M" over the last 6 with R1-R6 chips marked W or L (the cross-set fix replacing Proving Ground's tally squares), and checks off drills. A 0.1 data folder opens unchanged (tested).
7. **Rhetoric** (M11, part of M12). The figures in The Clearing's six effect groups with **The Clearing's own definitions, word for word** (a test compares them with `writing-bench/shared/craft-paths.js` whenever that file is on the computer); 28 examples, each an exact line from one of six public-domain speeches (Wikisource texts; Anthony's opening line corrected from a vandalized copy). The device finder keeps a mark only if the figure is on the list and the quote is an exact substring after whitespace is normalized (curly quotes and dashes folded); at most 40. Spot the figure is model-free (the answer is known). Write your own line gets a coach critique that never writes. Say it records 0:30. "Further reading: Mark Forsyth, The Elements of Eloquence (2013)" on the figure list.
8. **Lincoln-Douglas** (M4). 0.1's room in the frame; each of the student's speeches can be spoken with the same recorder, the transcript replaces the box (with "Bring back my typed draft"), the real speaking time replaces the estimate, and measured tags from every spoken speech ride on the LD ballot. The browser dictation button is gone. The LD judge now also returns tags from the fixed list.

## Spikes (SPEC section 8)

| Spike | Result |
|---|---|
| P1 webkitSpeechRecognition in Hermes | Not run live (no Hermes runs here). Removed per SPEC; a test proves the bundle no longer contains it. |
| P2 mic in a plugin page | **Passed in Chrome** with a fake mic (live.mjs). Not yet in Hermes 0.23 Electron: the first macOS prompt, denied-then-retry, and the wake word holding the mic are Tuesday checks. |
| P3 faster-whisper | **Partly passed.** Hermes's venv imports faster_whisper 1.2.1 in 1.6 s; PyAV decodes a webm/opus file at 16 kHz with no system ffmpeg; `transcribe()` takes word_timestamps, initial_prompt and vad_filter. **No speech model is cached on this Mac** (no `models--Systran--faster-whisper-*` anywhere), so the first transcript downloads base.en (about 140 MB) from huggingface.co. I did not download it (a download needs Damon's OK); the 60 s and 7 min timings are still unmeasured. Turn-on wording settled from Hermes's Settings labels: "In Hermes Settings, Voice, set the speech-to-text provider to local and use voice input once." |
| P4 TTS through dispatch_tool | Not started (SHOULD S1). |
| P5 headlines | **Passed from this Mac** through the plugin's own fetcher (not yet from inside the gateway or behind a proxy): all 10 default outlets answered in 1.2 s. Google News works for every outlet including City Journal (which has no RSS feed of its own). Own feeds checked with curl: National Review, AEI, UnHerd 200; City Journal none. Google's feed terms allow personal feed-reader use, which this is. |

## Damon's addition: the center-right outlets

Added National Review (AllSides **Lean Right** for its news pages, high confidence; its opinion pages are rated Right), City Journal of the Manhattan Institute (**Right**, low confidence), AEI (**Lean Right**, low confidence; the AllSides page also says "far right" in one line and is inconsistent) and UnHerd. **UnHerd is rated Center by AllSides** (moved from Lean Right in July 2023, low confidence), so it sits in the center column with Reuters and AP, labeled Center. Every label and side is the student's to change.

**The default set is now lopsided: 2 left (NPR, NYT), 3 center (Reuters, AP, UnHerd), 5 right (Examiner, Washington Times, National Review, City Journal, AEI).** `headlines.balance()` reports it. Center-left counterparts that would rebalance it, labels checked on AllSides Nov 7:

- **The Atlantic** (Left), the magazine of ideas opposite National Review and City Journal.
- **Washington Monthly** (Lean Left), the policy magazine opposite City Journal.
- **Brookings** (rated Center, not left), the think tank opposite AEI; it would join the center column.

Recommendation: add The Atlantic and Washington Monthly to the defaults (4 left, 3 center, 5 right), keep Brookings as a suggestion. They are already offered under "Your outlets"; making them defaults is a two-line change in `headlines.DEFAULT_OUTLETS`. Damon decides.

## What is left, in priority order

1. **Lincoln-Douglas in the new frame** (M1). The room still uses 0.1's equal-width board and side clock. Replace the board with the to-scale strip (6-3-7-3-4-6-3 plus Ballot), use the big clock and cards while the student speaks, and make the 0.1 paper ballot white (it is still tinted toward yellow). Move the LD ballot to the 10-second sheet (M5 LD version).
2. **Live waveform while speaking.** The lower half of the floor is empty during a take; draw the level as it comes in (the demo's 0:28-0:44 shot).
3. **A Settings view** (SPEC Screens): transcript model, recordings (count, size, Delete all), outlets (the editor exists inside the draw stage), transcription status.
4. **Extemp "internet allowed" prep mode** through `ctx.dispatch_tool("web_search")` (cut order item 2; "files only" ships now).
5. **Rhetoric:** pick the figure under the Write step from the marked text; "Say it" ties back to the line written.
6. **Model routing:** registering `ld_judge` and friends as auxiliary tasks is held back on purpose. A registered task defaults to provider "auto" and a 60-second timeout (`hermes_cli/plugins_aux_tasks.py`), which could silently move the judge to another model and cut long ballots. Decide after a live check.
7. **README** (full rewrite of the feature sections), **manual**, **card image** from the speaking shot, final screenshots re-pinned, version bump PR.
8. **Security bar** (`../SECURITY-BAR.md`): bandit and semgrep runs, the hostile-content red-team tests, docs/SECURITY-AUDIT.md by a separate auditor. Built for already: fetchers pinned to checked public IPs per hop and listed hosts only, DTD refused before XML parsing, uploads capped and MIME-checked, file names never from the page, model output rendered as text only.
9. Persona testers (AI personas: an extemp competitor, an LD varsity debater, a coach) through the harness.

## Known risks

- **Transcripts are unverified live.** No model is cached, so the first take on Damon's Mac downloads about 140 MB before any words appear, and a 7-minute take on CPU may take a while (unmeasured). The page shows "Making the transcript on this computer" with Stop, and the ballot waits for the words. Tuesday: run one 60 s take before filming.
- **Recording in Hermes Electron** is verified only in Chrome. The wake word can hold the mic; the message names it.
- **Accent collisions.** With a red accent the judge's pen and the DRILL stamp are both red, and with a green accent the pen matches "right" answers. Meaning is still carried by shape and word (X in a box, a circle on the scale, underlines, the word DRILL), so nothing becomes ambiguous; screenshots: `extemp-ballot-red-accent.png`, `extemp-ballot-green-accent.png`.
- **The Clearing's glosses are terse** ("Interrupted repetition.", "Circular return."). They are shared word for word as asked; each figure with an example shows the real line beside it. 18 figures (alliteration, assonance, rhyme, versification, antithesis, paradox, personification and the classical additions) have no Clearing gloss yet and carry ours (`source: "workbench"` in `rhetoric_method.py`); copy those back into The Clearing so both agree. 25 figures still have no example line.
- **Google News links** are redirect wrappers that open only in a browser; "Save to file" keeps the wrapper link. Article text is never fetched.
- Python 3.9 (system) runs the tests; Hermes runs 3.11. Nothing newer than 3.9 syntax is used.

## Decisions for Damon (new this stage)

1. Make The Atlantic and Washington Monthly default outlets to rebalance the set (recommended), or leave the right column heavier.
2. OK to download the base.en speech model (about 140 MB from huggingface.co) on this Mac for the P3 timing run, before Tuesday?
3. The Clearing's short definitions: keep them word for word (current), or let both products add one plain sentence under each.
