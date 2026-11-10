"""Writes harness/fixtures_figures.js: the marks for each bundled speech (the stored notes, through the plugin's own
annotated_marks, exactly what /rhetoric/marks returns) and a hand-written Socratic reply for "Try it", put through
the plugin's own socratic_guard. Run: /usr/bin/python3 harness/make_figures_fixtures.py"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import rhetoric_method as R  # noqa: E402

LINE = "Prices pinch every paycheck, and patience will not pay the rent."
# Hand-written, not captured from a model: what a good Socratic reply to LINE looks like for the Gettysburg merism.
REPLY = ('You are close: "Prices pinch every paycheck" is concrete and a listener can picture it. Merism names two ends to mean everything between them, '
         'and your line names one thing at each end only by accident. Who is at the far end of "every paycheck," and who is at the other? '
         'What would the listener feel if both ends were named on purpose? Which of the two ends do you want them to see first?')

marks = {}
for s in R.speeches():
    ms = R.annotated_marks(s["id"])
    marks[s["id"]] = {"marks": ms, "counts": R.counts(ms), "checked": True, "dropped": 0, "stored": True, "text": s["text"]}
reply = {"text": R.socratic_guard(REPLY, LINE, "The brave men, living and dead")}
out = ("// Written by harness/make_figures_fixtures.py. The marks are the plugin's own stored notes; the Try-it reply is hand-written.\n"
       "const MARKS = " + json.dumps(marks, ensure_ascii=False) + "\nconst TRY = " + json.dumps(reply, ensure_ascii=False) + "\n"
       "export async function answer(path, options, { clone }) {\n"
       "  const b = options && options.body\n"
       "  if (path === 'rhetoric/marks' && b && b.speech_id && MARKS[b.speech_id]) return clone(MARKS[b.speech_id])\n"
       "  if (path === 'rhetoric/critique' && b && b.speech_id) return clone(TRY)\n"
       "  return undefined\n}\n")
(ROOT / "harness" / "fixtures_figures.js").write_text(out, encoding="utf-8")
print("wrote harness/fixtures_figures.js", len(out))
