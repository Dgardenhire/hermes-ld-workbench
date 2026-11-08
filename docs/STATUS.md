# Debate Workbench 0.2: status

Updated Nov 8, 2026, after Damon's four decisions (stage 4 follow-up). Branch `v0.2`, not pushed. Packet: `claude-test/.planning/hackathon-2026-11/debate-workbench/` (SPEC.md, DESIGN.md with the step 7 review at ship). Build deadline: Monday Nov 9, 6 PM CT. Tuesday: live test and filming.

**Tests: 181, all passing** (`/usr/bin/python3 -m unittest discover -s tests`, about 2 s). Stage 4 ended at 169. The desktop bundle is current (`build.mjs . --check`). gitleaks: no leaks. Hermes's admission validator and the catalog validator were not re-run this pass (no manifest or catalog-schema change; the PR text and LIVE-TEST were edited).

## Follow-up, Nov 7 to 8: Damon's decisions, built

1. **Balanced default outlets** (decision 1). The Atlantic (AllSides: Left) and Washington Monthly (Lean Left) are now defaults, opposite National Review and City Journal. By column 4 left, 3 center, 5 right; by AllSides label 5 to 5 (AP sits with the wires but is rated Lean Left). Brookings stays a suggestion, with The Wall Street Journal. Every outlet is labeled and the list stays editable. `headlines.balance()` now also counts by label; the outlet editor shows both tallies and warns when one side has twice the other.
   - **Checked live, Nov 7:** `curl` on both new feeds (200, RSS) and on Google News `site:` search for all three (200, items). Then the plugin's own `headlines.fetch` and `pull()` against all twelve defaults on "the Federal Reserve": every column answered through Google News, about 2 s in all. Brookings's `/feed/` redirects to its home page (HTML), so it keeps no feed and relies on Google News.
   - **Found and fixed on the way:** The Atlantic's own feed (340 KB) is cut at the 250 KB cap, and its entries carry `media:` and `xml:` names declared on the root, so the item-by-item fallback parsed nothing. The fallback now drops namespace prefixes (17 items read from the capped feed). A bare topic page ("Federal Reserve" from theatlantic.com) is now dropped as an index page. The pull runs one worker per column (was 8), so twelve outlets never queue behind the 20 s deadline.
2. **Figure definitions** (decision 3). Zeugma, syllepsis, merism and synecdoche now carry The Clearing's own new definitions, word for word from `hermes-clearing` 3a97a48 (`library/additions.json`, figures.groups); a test reads that commit and compares (skipped when the repo is not beside this one). Each has its own public-domain example: merism and synecdoche keep their Lincoln lines; zeugma is Susan B. Anthony's "which ordains all men sovereigns, all women subjects" (one verb serving both clauses in the same sense, as the new definition says); syllepsis is Pope's "Dost sometimes counsel take—and sometimes tea." (*The Rape of the Lock*, 1714, checked against Project Gutenberg eBook 9800), because none of the six speeches shows it cleanly. A book line carries author, title and year; Spot still draws only speech lines. The Clearing's own examples for these four are sentences written for it, not quotes, so the examples differ by design; the definitions are identical. No two figures share a definition now (test). Screens: `rhetoric-figures-light.png`, `rhetoric-figures-dark.png`.
3. **Remove for extemp-file entries** (open item 6). Every source in prep has **Remove**, with an inline confirm ("Remove it from your file for good?", Remove / Keep it). Removing also unpicks it from the round in progress, on the backend and in the page; a second remove of the same item says "That item is no longer in your file." Screens: `extemp-prep-remove-dark.png`, `extemp-prep-remove-light.png`.
4. **The film's question** (decision 2). The 60-second answer and the openings lab now open on "Should the Federal Reserve care more about prices or about jobs right now?" (the starter list leads with it, then the four-day school week; tariffs moved to fourth). The seeded practice ballots (`harness/seed_demo.py` via `make_fixtures.py`) are low-partisan: a Fed answer citing a real Reuters headline from the Nov 7 pull, six Lincoln-Douglas rounds on civil disobedience (was a carbon tax), and extemp history on a four-day school week and the UN Security Council. A test checks the seed has no tariff, carbon tax or party names. The harness's full round, file and web results also moved to the Fed (real headlines; real federalreserve.gov pages), `fixtures02.js` was regenerated from the live twelve-outlet pull, every screen was remade, and the catalog card now shows the Fed question.

Tests added this pass: outlets balanced by label, Brookings a suggestion, lopsided lists still flagged, defaults fit one pull, a capped namespaced feed keeps its items, bare topic pages dropped; Remove unpicks and reports a gone item, and works with no round; the bundle has the Remove confirm; book examples checked against their text and kept out of Spot; the floor and openings open on the Fed question; the seed is low-partisan.

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

- **A real race in the transcript job, found by a flaky test.** Stage 3's `test_typed_words_survive_a_late_transcript` failed whenever its output was piped (slower scheduling). The job marked the take "working" without checking it was still waiting, so typed words that landed between its cancel check and that write were overwritten: the take ended "cancelled", and with no cancel flag the machine's words replaced the student's. The job now starts only from "waiting" and stops if the student's words are already there (`speech.Transcriber._run`). A new test drives that exact window and failed before the fix (`('done', 'machine words')`).
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
6. SHOULD, in SPEC order: S3 Delivery lab, S4 token meter, S5 spoken cross-ex answers, S6 extemp drills.
7. Rhetoric: pick the figure under Write from the marked text; tie Say it to the line written.
8. Model routing: registering `ld_judge` and friends as auxiliary tasks is still held back.

## Known risks

- **Microphone and transcripts are verified only in Chrome**, not in Hermes Electron. The wake word may hold the mic; the message names it.
- **First transcript downloads about 145 MB.** Do one throwaway take before filming. 60 s and 7 min timings unmeasured.
- **Slow models** can hit the 180 s limit on a 7-minute speech; the student sees "took too long" and can retry.
- **Web search and Hear it from a REST route** use `tools.registry`; if the registry is not loaded in the dashboard process or the toolset is off, the student sees the plain "not set up" message. Verify Tuesday.
- **Accent collisions:** with a red accent, the pen, the primary button and DRILL share a hue; meaning rides on shape and words. Screens: `extemp-ballot-red-accent.png`, `extemp-ready-red-accent.png`.
- **Google News links** are redirect wrappers; they open in a browser only. Article text is never fetched.
- Tests run on Python 3.9; Hermes runs 3.11. Nothing newer than 3.9 syntax is used.

## Decisions for Damon (open)

1. OK to download base.en (about 145 MB from huggingface.co) on this Mac before Tuesday to time the transcripts?
2. The web manual (item 5 above): update it for 0.2, or leave it.
3. Syllepsis's example comes from a book (Pope), because none of the six speeches shows it cleanly. It is a stock handbook line; Forsyth's book may use it too, though nothing is copied from it. Keep it, or find a public-domain speech that shows the figure?
4. The Clearing also reworded seven other figures (alliteration, assonance, anaphora, epistrophe, epanalepsis, periodic sentence, parataxis). The workbench still uses the older craft-paths glosses for those (its word-for-word test reads the writing-bench source). Copy the whole set from 3a97a48 so all shared figures match?

Decided Nov 7 and built above: balanced outlets (1), the Fed question for the film (2), distinct figure definitions (3).
