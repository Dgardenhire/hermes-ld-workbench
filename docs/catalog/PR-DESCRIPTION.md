# DRAFT, not submitted

Title: `plugin-catalog: bump ld-workbench to 0.2.0 (Debate Workbench)`

Replace PINSHA with the merge commit of v0.2 before opening. Old pin: `e502204bcf5e975878d1a35bfdc2f939724cf2ca` (0.1.0).

---

## What this changes

SHA bump for `ld-workbench` (Debate Workbench), 0.1.0 to 0.2.0, submitted by the repository owner (rule 5). Commit range to review: `e502204...PINSHA` on https://github.com/Dgardenhire/hermes-ld-workbench.

0.2 turns the Lincoln-Douglas workbench into practice for three events, spoken out loud:

- **A real clock and the timekeeper's cards.** The event is drawn to scale in time across the top. The microphone records in the page (MediaRecorder); the clock starts at the first sound; pauses over 2 seconds are marked on the waveform.
- **Transcripts that follow the user's Hermes voice settings.** Each take goes first to Hermes's own speech-to-text (the one Hermes's voice input uses: local or the cloud provider the user chose), then, when Hermes cannot without a download of its own, to faster-whisper with a model in the plugin's own data folder. No dependency is declared; without either every take is "timing only".
- **Extemp:** a 60-second answer, three-openings practice, and a full round: this week's headlines on the student's topic from twelve outlets on the left, center and right, five to five by lean label (user-editable, labeled by lean), a draw from the student's own saved news, 30 minutes of prep, a 7-minute speech, a ballot.
- **Rhetoric:** figures of speech marked in six public-domain speeches, every quote checked as an exact substring; spot, write and say drills.
- **The coach, after the student tries:** examples (a strong answer, opening, three versions of a line, a redo from a ballot) and suggestions (extemp areas and evidence from the student's own file; contentions, a framework, a block, a stronger card), each marked as the coach's, every citation, quote, figure and date checked in code; a coach chat on every screen; Settings, Coach examples, turns examples off.
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
- **Recordings:** saved only in `$HERMES_HOME/plugin-data/ld-workbench/recordings/`; newest 20 and at most 100 MB kept; delete-all in Settings. A second Settings button deletes every transcript and ballot (and a round in progress), with a confirm.
- **Transcription, engine 1: Hermes's own speech-to-text.** One worker thread in the Hermes backend converts the take to 16 kHz mono WAV (PyAV, or ffmpeg when PyAV is missing, fixed arguments) and calls `tools.voice_mode.transcribe_recording`, in a copy of the request's context so it runs in the requesting profile's config scope, as the core route does through `asyncio.to_thread`. It uses the user's `stt` provider and Hermes's hallucination filter. **If that provider is a cloud service (or Hermes would pick one at run time), a take goes to it only when the student presses Transcribe now on that take, after the take names the provider**; never on its own, and every take asks again. When the plugin's own faster-whisper can run with no download, it makes the transcript locally instead. It runs on its own only when Hermes would not first download a model (its local model must already be in the cache); otherwise engine 2 is used.
- **Transcription, engine 2: faster-whisper**, when Hermes's local speech-to-text installed it. Its model lives in `$HERMES_HOME/plugin-data/ld-workbench/models/`, never in the shared Hugging Face cache (which on some machines is a link to an unmounted drive; that cache is only read, as a bonus). The model is downloaded from huggingface.co only when the student presses Transcribe now after seeing the size (no audio is sent); a new recording never starts a download. The download runs in one separate Python process (`sys.executable -I -c <fixed script> <repo> <folder>`, no shell) with `HF_HOME`, the hub cache and the xet cache inside the plugin folder and `token=False`, so the user's Hugging Face settings and token are never used. With a remote Hermes backend, the recording goes to that backend.
- **Private Hermes import (rule 9), disclosed:** `tools.voice_mode.transcribe_recording` is not in `hermes_cli/data/plugin_api.json`, so admission lists it as a warning. Reason: it is the only way a plugin can use the user's configured speech-to-text; a desktop page cannot call the core `/api/audio/transcribe` route (`ctx.rest` is scoped to `/api/plugins/<id>/`), and `agent.transcription_provider` is for registering a provider, not calling one. Fallback: the import is guarded; if a release moves or changes the function, transcripts fall back to engine 2, and timing-only mode always works. The profile's `stt` settings are read through the public `hermes_cli.config`. We would like to propose a public plugin transcription call (the "declared-capability seam" `apps/desktop/src/api/plugins.ts` mentions) after the contest.
- **Third-party network calls, each only on a button press:**
  1. Headline pull: a Google News RSS search per outlet on the student's list, plus those outlets' own RSS feeds as fallback. Https only, listed hosts only, public addresses only, 8-second timeout, 250 KB cap, 20 seconds for the whole pull. Headlines and links only.
  2. A link saved to the extemp file or added as a topic source: one public page, every redirect re-checked, 20-second timeout, first 30,000 characters.
- **Hermes tools, each only on a button press, through the public `tools.registry`:** `web_search` (extemp prep, only in rounds started with internet allowed) and `text_to_speech` (Hear it, the AI opponent's speech). The plugin holds no keys.
- **Model calls:** through `PluginLlm` to the user's own model; each call has a 180-second limit.
- **Never:** credentials, telemetry, shell commands, cron or blueprints, self-updates, compiled binaries. Separate processes only as listed above (the model download; ffmpeg when PyAV is missing). One private Hermes import, listed above.
- **Registers:** a Desktop page, a dashboard API, the `/debate` command, two read-only agent tools (`debate_record`, `debate_today`: counts, tags, dates and question text only; both refuse in cron runs), three model rows (Debate judge, Debate opponent, Debate coach, timeout 180 s) and the bundled `debate-coach` skill. No hooks or middleware.
- **Files:** reads a .docx, .txt or backup file only when the user picks one; writes exports only to a save-dialog path (never a hidden folder or ~/Library) or its own exports folder.
- **Not affiliated** with Nous Research, the National Speech & Debate Association, AllSides or any news outlet.

## Checks run on the pinned commit

- `/usr/bin/python3 -m unittest discover -s tests`: all tests pass (count filled in at the pinned commit; 235 on Nov 8).
- Hermes's full admission validator (`hermes_cli.plugin_validate.validate_plugin_dir`) on a copy: expected to pass with one warning, the private import of `tools.voice_mode` (re-run before opening this PR).
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
