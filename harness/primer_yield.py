"""The primer yield run (Lane F, the Monday noon gate): one Get up to speed press on each of the 10 pool
questions (5 United States, 5 International), and a row per question with its dated facts.

Pass: at least 3 dated facts on 9 of 10 questions. Run it with the Python that runs Hermes, in the QA profile,
so web_search and the model resolve the way the Debate page's routes do:
    <hermes python> harness/primer_yield.py
It uses the plugin's own routes module (WEB_SEARCH, MODEL) and the real reader. Not run yet: written Nov 8,
2026, without Hermes on hand; the in-repo test (tests/test_evidence.py YieldRun) runs it on fake pages only."""
import asyncio
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("plugin_api_yield", ROOT / "dashboard" / "plugin_api.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
ev = api._evidence()

rows = asyncio.run(ev.yield_run(lambda q: api.WEB_SEARCH(q), api.MODEL))
for r in rows:
    print(f"{'PASS' if r['passed'] else 'MISS'}  {r['dated']} dated  {r['cards']} cards  {r['seconds']:>5.1f} s  "
          f"coach={'yes' if r['coach'] else 'no'}  {r['question']}" + (f"  ({r['error']})" if r["error"] else ""))
passed = sum(r["passed"] for r in rows)
print(f"\n{passed} of {len(rows)} questions had 3 dated facts. Gate: 9 of 10. {'PASSED' if passed >= 9 else 'NOT PASSED'}")
if "--json" in sys.argv:
    print(json.dumps(rows, indent=1))
