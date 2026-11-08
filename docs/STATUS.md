# Debate Workbench 0.2: status

Updated Nov 7, 2026, end of stage 4 (polish and package). Branch `v0.2`, not pushed. Packet: `claude-test/.planning/hackathon-2026-11/debate-workbench/` (SPEC.md, DESIGN.md with the step 7 review at ship). Build deadline: Monday Nov 9, 6 PM CT. Tuesday: live test and filming.

**Tests: 168, all passing** (`/usr/bin/python3 -m unittest discover -s tests`, about 2 s). Stage 3 had 164; this stage added 3 for the drill checkbox and 1 for the demo seed. The desktop bundle is current (`build.mjs . --check`). Hermes's full admission validator (`hermes_cli.plugin_validate.validate_plugin_dir`, on a copy with a scratch HOME) passes 16 of 16 checks, no warnings. The draft catalog entry passes `validate_plugin_catalog.py` with the current HEAD in place of PINSHA. gitleaks: no leaks.

Every SPEC MUST is built except M14 (the film, Tuesday) and the live checks inside Hermes (Tuesday). SHOULD done: S1, S2. Not started: S3 to S6.

## Stage 4, what changed

**Design step 7 on the real screens** (light, dark, red and green accents, 760px and 1920px windows). Full write-up in the packet's DESIGN.md, "Step 7 at ship". Fixed:

1. Narrow pane: the rail row clipped "Settings"; now it wraps, names only, current event underlined.
2. Narrow pane: a 107px empty band above the strip (stretched grid rows).
3. Narrow pane: the ballot header's second row was indented with a stray rule.
4. Wide pane: the floor now stops at 1240px; the drill row's label pins right.
5. Rail spacing (2, 18, 28px) made into a system: events together, Ballots below, Settings at the foot.
6. Accent kept to its jobs: the stripe on the live Recording panel and the accent rule on the Spot quote are gone.
7. "0 pauses over 2 seconds" reads "No pauses over 2 seconds".
8. The speaking screenshot now comes from a spoken answer with a pause (macOS `say` as the fake mic), so the waveform shows a real envelope and a pause mark.

Recorded in the look ledger (`design_ledger.py add`, project `debate-workbench-0.2`).

**Copy audit** of every screen (rendered text of 17 views) and every Python error message:

- "Bad case.", "Bad request." and six like them now say what could not be read.
- "The model did not return the expected format" is now "The model's answer could not be read. Try again."
- "Something went wrong on our end" is now "Something went wrong. Try again. If it keeps happening, restart Hermes."
- "The workbench is not connected." now adds "Close Debate and open it again."
- Settings, What leaves your computer: "never sent anywhere" was not exact with a remote backend; now "kept on the computer that runs Hermes. It never goes to a model or a website." Web search added to the list. Saved links names both ways a page is read.
- The harness had shown "Live round test" and "Verification case" as case names. The fixtures were already fixed; the headless profile was serving a cached old copy. `click.mjs` and `live.mjs` now disable the cache.

**Behavior fixes found on the way:**

- Ballots: the drill checkbox now sends the ballot's time, so a list trimmed to 40 cannot tick the wrong ballot (stage 3 open item 3). 3 tests.
- When Hermes cannot open the browser (`openExternal` false or missing), the link is shown to copy (stage 3 open item 4). Checked in the harness.
- After a 60-second answer is judged, the drill under the floor is the new one (the home data now reloads after the ballot). Before, "Try it again" showed the previous drill.
- The drill checkbox has an accessible name.

**Package:**

- `README.md`: a Disclosures section (microphone, recordings of students, AI judges, optional transcripts, news labels, public-domain speeches and The Clearing's definitions, not affiliated, nothing runs on its own); links to the manual and changelog; the strip described accurately.
- `docs/MANUAL.md`: a short manual, including a table of every message a student may hit and what to do.
- `CHANGELOG.md`: 0.2.0 and 0.1.0.
- `LICENSE`: MIT, unchanged (the packet names no other).
- `docs/card.png` (1200x600) from `docs/card.html`: the real speaking screen, cropped, with the name and the three events.
- `docs/catalog/ld-workbench.yaml`: the draft entry, image now the card, docs_url now `docs/MANUAL.md`, every pin `PINSHA` (replace at release). `docs/catalog/PR-DESCRIPTION.md`: the draft SHA-bump PR with the rule 13 disclosure. Neither is submitted.
- Screenshots for the PR: `docs/shots/v02/` (31 screens; `harness/shoot.sh` remakes them). New: `extemp-ready-red-accent`, `extemp-ready-narrow-light`, `extemp-ready-wide-dark`, `ld-ballot-narrow-light`.
- `docs/LIVE-TEST.md`: Tuesday's checklist, riskiest first. `docs/DEMO-NOTES.md`: the moments to film, with steps.
- `harness/seed_demo.py`: writes the nine practice ballots into a chosen `plugin-data/ld-workbench` folder for the film. It refuses any other folder name and any folder that already has ballots (unless `--force`, which backs up first). Never run against a real profile by me.

## What works now

Unchanged from stage 3 except the fixes above; see the stage 3 notes in git history (`git show 0497c0c:docs/STATUS.md`). In short: the frame (rail, strip to scale, clock, time cards) for every event; the recorder with live waveform and pause marks; takes, transcripts with faster-whisper when present, timing-only otherwise; extemp (60-second answer, openings, full round with the headline pull from ten outlets on three sides, draw, prep files-only or internet-allowed, speech, ballot); the 10-second ballot with quoted lines checked against the transcript; Ballots with patterns counted in code and R1 to R6 chips; Rhetoric with The Clearing's definitions and exact-quote marks; Lincoln-Douglas spoken, with Hear it; Settings.

## What is left, in priority order

1. **Tuesday's live test** (`docs/LIVE-TEST.md`). The four never-run paths: the microphone inside Hermes Electron, the first transcript (base.en download) and its timing, one long model call against the 180 s limit, and web search and Hear it through `tools.registry` from the dashboard process. Then headlines from inside the gateway.
2. **The film** (`docs/DEMO-NOTES.md`), after the live test passes.
3. **Security bar** (`../SECURITY-BAR.md`): bandit and semgrep, the hostile-content tests, and a separate auditor's sign-off before release.
4. **Release:** push `v0.2`, merge, replace `PINSHA` in `docs/catalog/ld-workbench.yaml` and the PR text, check each image URL opens, open the PR (Damon's call).
5. **The web manual** at linchpin.studio/hermes/ld-workbench/manual/ still describes 0.1. The catalog draft now points at `docs/MANUAL.md` instead. Update the web page or leave it as 0.1's.
6. `POST /extemp/file/{id}/delete` has no button. Add a remove control with a confirm, or drop the route.
7. SHOULD, in SPEC order: S3 Delivery lab, S4 token meter, S5 spoken cross-ex answers, S6 extemp drills.
8. Rhetoric: pick the figure under Write from the marked text; tie Say it to the line written.
9. Model routing: registering `ld_judge` and friends as auxiliary tasks is still held back.

## Known risks

- **Microphone and transcripts are verified only in Chrome**, not in Hermes Electron. The wake word may hold the mic; the message names it.
- **First transcript downloads about 145 MB.** Do one throwaway take before filming. 60 s and 7 min timings unmeasured.
- **Slow models** can hit the 180 s limit on a 7-minute speech; the student sees "took too long" and can retry.
- **Web search and Hear it from a REST route** use `tools.registry`; if the registry is not loaded in the dashboard process or the toolset is off, the student sees the plain "not set up" message. Verify Tuesday.
- **Accent collisions:** with a red accent, the pen, the primary button and DRILL share a hue; meaning rides on shape and words. Screens: `extemp-ballot-red-accent.png`, `extemp-ready-red-accent.png`.
- **Google News links** are redirect wrappers; they open in a browser only. Article text is never fetched.
- Tests run on Python 3.9; Hermes runs 3.11. Nothing newer than 3.9 syntax is used.

## Decisions for Damon (open)

1. **The default outlets are lopsided.** By column: 2 left (NPR, NYT), 3 center (Reuters, AP, UnHerd), 5 right (Washington Examiner, Washington Times, National Review, City Journal, AEI). By AllSides label it is 3 leaning left (AP is rated Lean Left but sits in the center column as a wire), 2 Center, 5 leaning right. **Recommendation:** add **The Atlantic** (AllSides: Left) and **Washington Monthly** (Lean Left) as defaults, the magazines opposite National Review and City Journal. That makes 4 left, 3 center, 5 right by column and 5 to 5 by label. Keep **Brookings** (rated Center, the think tank opposite AEI) as a suggestion. Two lines in `headlines.DEFAULT_OUTLETS`; both are already offered under Your outlets. The page flags the imbalance today (`headlines.balance()`).
2. **The film's question** (DEMO-NOTES): the default tariffs question, or a lower-partisan one already in the starter list (the Fed, or a four-day school week). Recommendation: the Fed question.
3. **Two figure pairs share one definition** (zeugma and syllepsis; merism and synecdoche), because The Clearing shares them. Recommendation: merism "A whole named by listing its parts.", syllepsis "One word used in two senses at once.", in both products.
4. OK to download base.en (about 145 MB from huggingface.co) on this Mac before Tuesday to time the transcripts?
5. The web manual (item 5 above): update it for 0.2, or leave it.
