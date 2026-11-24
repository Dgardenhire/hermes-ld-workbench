# Security

## Reporting a problem

For anything that should not be public first, use GitHub's private vulnerability reporting on this repository
(Security tab, "Report a vulnerability"). Anything else: open an issue at
https://github.com/Dgardenhire/hermes-ld-workbench/issues. Expect a first reply within a week.

Debate Workbench is built for students, many of them under 18. A report that a student's voice, words or ballots
could leave the computer without a press is treated as the most urgent kind.

## What Debate Workbench does

- **Backend** (`__init__.py`, `dashboard/plugin_api.py` and the modules it calls): the page's routes inside Hermes's
  plugin host, the `/debate` command, two read-only agent tools (`debate_record`, `debate_today`) and a skill. No hooks
  and no middleware.
- **Desktop page** (`desktop/plugin.js`): one built ES module that imports only `@hermes/plugin-sdk`, `react` and
  `react/jsx-runtime`. Its source is `desktop/src/` and `vendor/hermes-ui-kit/`; `node scripts/verify-bundle.mjs`
  rebuilds it and exits 0 only if the result is byte-identical.

## Boundaries it holds itself to

- **No credentials.** It asks for no keys and declares no `requires_env`. Model, speech-to-text, web search and voice
  calls go through Hermes.
- **Two outside programs, each on a short list of settings.** ffmpeg (to convert a take) and one isolated Python
  process (the speech-model download the student asks for). Neither receives Hermes's environment;
  `tests/test_launch_env.py` fails if any launch in the repository inherits it.
- **The speech model is pinned to exact files.** The download is fixed to one Hugging Face commit per model, and every
  file is checked against its recorded SHA-256 or git blob id (`MODEL_HASHES` in `speech.py`); a download that differs
  in any byte is thrown away.
- **Network only on a press**, with one disclosed exception (the coach's example after a 60-second answer, which a
  teacher can turn off). The README's "What leaves your computer" lists every request.
- **No shell, no background jobs, no telemetry, no self-updates.**

## Data

Everything it keeps is in `plugin-data/ld-workbench` inside the Hermes folder. Deleting that folder erases it.

## What a reviewer can check

- `hermes plugins validate .`: passes; the one warning is the guarded import of `tools.voice_mode`.
- `/usr/bin/python3 -m unittest discover -s tests`: the suite.
- `npm ci --ignore-scripts --prefix vendor/hermes-ui-kit && node scripts/verify-bundle.mjs`: the page file matches its
  source.
