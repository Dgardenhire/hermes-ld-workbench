# DRAFT, not submitted

Title: `plugin-catalog: bump ld-workbench to 0.2.0 (Debate Workbench)`

Replace PINSHA with the merge commit of v0.2 before opening. Old pin: `e502204bcf5e975878d1a35bfdc2f939724cf2ca` (0.1.0).

---

## What this changes

SHA bump for `ld-workbench` (Debate Workbench), 0.1.0 to 0.2.0, submitted by the repository owner (rule 5). Commit range to review: `e502204...PINSHA` on https://github.com/Dgardenhire/hermes-ld-workbench.

0.2 turns the Lincoln-Douglas workbench into practice for three events, spoken out loud:

- **A real clock and the timekeeper's cards.** The event is drawn to scale in time across the top. The microphone records in the page (MediaRecorder); the clock starts at the first sound; pauses over 2 seconds are marked on the waveform.
- **Transcripts on the user's own machine** with faster-whisper, only when Hermes's local speech-to-text is already installed. No dependency is declared; without it every take is "timing only".
- **Extemp:** a 60-second answer, three-openings practice, and a full round: this week's headlines on the student's topic from twelve outlets on the left, center and right, five to five by lean label (user-editable, labeled by lean), a draw from the student's own saved news, 30 minutes of prep, a 7-minute speech, a ballot.
- **Rhetoric:** figures of speech marked in six public-domain speeches, every quote checked as an exact substring; spot, write and say drills.
- **Ballots:** every ballot kept; patterns counted in code from a fixed tag list over the last six rounds.

Full list: `CHANGELOG.md`. Manual: `docs/MANUAL.md`.

## Entry changes

- `sha`: e502204 to PINSHA
- `version`: "0.2.0" (matches `plugin.yaml`)
- `description`: rewritten for 0.2, with the disclosure below
- `image`: `docs/card.png` (new 1200x600 card, cropped from the real speaking screen)
- `screenshots`: six 0.2 screens
- `docs_url`: `docs/MANUAL.md` at the pinned commit
- `requires_hermes`: unchanged, `">=0.22.0"`, same floor in `plugin.yaml`
- `category`: unchanged, `desktop`

## Disclosure (rule 13)

- **Microphone:** opened with `getUserMedia` only while the student presses Start speaking; stopped on finish, cancel, error or leaving the page.
- **Recordings:** saved only in `$HERMES_HOME/plugin-data/ld-workbench/recordings/`; newest 20 and at most 100 MB kept; delete-all in Settings.
- **Transcription:** faster-whisper in one worker thread inside the Hermes backend, when Hermes's local speech-to-text is installed. Its speech model is downloaded from huggingface.co only when the student presses Transcribe now (no audio is sent); a new recording never starts the download. With a remote Hermes backend, the recording goes to that backend.
- **Third-party network calls, each only on a button press:**
  1. Headline pull: a Google News RSS search per outlet on the student's list, plus those outlets' own RSS feeds as fallback. Https only, listed hosts only, public addresses only, 8-second timeout, 250 KB cap, 20 seconds for the whole pull. Headlines and links only.
  2. A link saved to the extemp file or added as a topic source: one public page, every redirect re-checked, 20-second timeout, first 30,000 characters.
- **Hermes tools, each only on a button press, through the public `tools.registry`:** `web_search` (extemp prep, only in rounds started with internet allowed) and `text_to_speech` (Hear it, the AI opponent's speech). The plugin holds no keys.
- **Model calls:** through `PluginLlm` to the user's own model; each call has a 180-second limit.
- **Never:** credentials, telemetry, shell commands, separate processes, cron or blueprints, self-updates, compiled binaries, private Hermes imports.
- **Registers:** no tools, hooks or middleware; a Desktop page and a dashboard API only.
- **Files:** reads a .docx, .txt or backup file only when the user picks one; writes exports only to a save-dialog path (never a hidden folder or ~/Library) or its own exports folder.
- **Not affiliated** with Nous Research, the National Speech & Debate Association, AllSides or any news outlet.

## Checks run on the pinned commit

- `/usr/bin/python3 -m unittest discover -s tests`: 169 tests pass.
- Hermes's full admission validator (`hermes_cli.plugin_validate.validate_plugin_dir`) on a copy: passes, no warnings.
- `scripts/validate_plugin_catalog.py` on this entry: OK.
- Desktop bundle built with the shared UI kit and current (`build.mjs --check`); imports only `react`, `react/jsx-runtime` and `@hermes/plugin-sdk`.
- gitleaks: no leaks. No `.pyc`, no binaries, no archives.
- Tested live in Hermes Desktop 0.23 on macOS: see `docs/LIVE-TEST.md` (results filled in before this PR is opened).

## Screenshots

| | |
|---|---|
| Speaking | `docs/shots/v02/extemp-speaking-dark.png` |
| The extemp ballot | `docs/shots/v02/extemp-ballot-dark.png` |
| Headlines from both sides | `docs/shots/v02/extemp-draw-dark.png` |
| The Lincoln-Douglas ballot | `docs/shots/v02/ld-ballot-light.png` |
| Rhetoric, a marked speech | `docs/shots/v02/rhetoric-read-dark.png` |
| Ballots and patterns | `docs/shots/v02/ballots-light.png` |
