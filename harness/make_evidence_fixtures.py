"""Write harness/fixtures_evidence.js: Get up to speed's answers for the harness, put through the real code
(evidence.py, the evidence/ routes, engine.run_source and PageText) so every card on screen is a sentence the
backend picked by number, with the outlet and date it read from the page. Run:
    /usr/bin/python3 harness/make_evidence_fixtures.py

Hand-written, not captured: the pages (tests/test_evidence.py PAGES) and the coach's answer (RAW). A fake
web search and a fake page fetch stand in for the network; a fake model hands RAW to the real route. Fixture
shots are craft-only: a live model and live pages write their own."""
import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ["LDW_DATA_DIR"] = tempfile.mkdtemp(prefix="ldw-evidence-fixtures-")
sys.path.insert(0, str(ROOT / "tests"))
from _load import api, engine, extemp, fake_model, run  # noqa: E402
from test_evidence import DEFAULT_RESULTS, PAGES, Q, envelope  # noqa: E402

ev = api._evidence()
llm = fake_model()
api.WEB_SEARCH = lambda q: envelope(DEFAULT_RESULTS)
engine.fetch_public = lambda url, hops=4: (url, "text/html", PAGES[url].encode()) if url in PAGES else (_ for _ in ()).throw(RuntimeError("404"))

RAW = {"picks": [2, 6, 8],
       "asks": "It asks which of the Fed's two jobs should come first right now: keeping prices steady or keeping people working. "
               "The answer turns on which problem is bigger today and which one is getting better on its own.",
       "sides": [{"label": "Prices first", "answer": "Prices are still rising faster than the Fed wants, and rising prices hit every family's budget. Finishing the job now keeps it from getting harder later."},
                 {"label": "Jobs first", "answer": "Hiring is slowing, and higher rates can cost workers their jobs. The Fed can ease off on prices a little to protect people who need work."}]}


async def press(question=Q):
    v = await api.post_evidence_primer({"question": question})
    await ev._jobs[v["id"]]["_task"]
    return await api.get_evidence_primer(v["id"])


def offered():
    body = llm.calls[-1]["input"][0]["text"]
    return [line for line in body.splitlines() if line.startswith("[")]


llm.queue.append(json.dumps(RAW))
done = run(press())
assert done["stage"] == "done" and len(done["cards"]) == 3, done
print("offered:", *offered()[:12], sep="\n  ")
print("cards:", *[f'{c["n"]} {c["outlet"]} {c["date_label"]}: {c["sentence"]}' for c in done["cards"]], sep="\n  ")
progress = {"id": done["id"], "question": Q, "stage": "reading", "label": "Reading 3 pages", "elapsed": 1.2, "pages_total": 3,
            "pages_read": 1, "disclosure": ev.DISCLOSURE, "final": False}

ev._jobs.clear()
llm.queue[:] = ["not json", "not json"]
late = run(press())

ev._jobs.clear()
extemp.add_item({"title": "Fed policymakers consider rate hike after strong jobs report", "outlet": "Reuters", "at": 1793998714,
                 "url": "https://news.google.com/", "topics": ["federal reserve"]})
api.WEB_SEARCH = lambda q: {"error": "Unknown tool: web_search"}
noweb = run(press())

ev._jobs.clear()
api.WEB_SEARCH = lambda q: envelope(["https://down.example/a", "https://down.example/b"])
offline = run(press())

for v in (done, late, noweb, offline):
    v["elapsed"] = {"done": 14.6}.get(v["stage"], v["elapsed"])
out = ROOT / "harness" / "fixtures_evidence.js"
out.write_text(
    "// Get up to speed answers for the harness, written by harness/make_evidence_fixtures.py (do not edit by hand).\n"
    "// Hand-written pages and coach answer, put through the real evidence.py routes. Craft-only.\n"
    f"export const PRIMER = {json.dumps({'progress': progress, 'done': done, 'late': late, 'noweb': noweb, 'offline': offline}, indent=1, ensure_ascii=False)}\n\n"
    "// The harness hook: answer the evidence/ routes, or undefined to fall through. ?primer=progress|done|late|noweb|offline\n"
    "export function handle(path, options, params) {\n"
    "  const scene = (params && params.get('primer')) || 'done'\n"
    "  const v = PRIMER[scene] || PRIMER.done\n"
    "  if (path === 'evidence/primer') return scene === 'progress' ? PRIMER.progress : { ...v, final: false, stage: 'searching', label: 'Searching' }\n"
    "  if (path.startsWith('evidence/primer/')) return scene === 'progress' ? PRIMER.progress : v\n"
    "  if (path === 'evidence/save') return { added: true, item: { id: 'saved1' } }\n"
    "  return undefined\n"
    "}\n")
print("wrote", out)
