"""Seed a Debate Workbench data folder with a practice history, so the Ballots view has patterns to show
on camera. These are the same practice ballots the screenshots use (harness/make_fixtures.py): six
Lincoln-Douglas rounds on civil disobedience and three extemp answers (the Federal Reserve, a four-day
school week, the UN Security Council), low-partisan on purpose. No client material and nothing about
any contest.

    /usr/bin/python3 harness/seed_demo.py <the plugin's data folder>

The data folder is plugin-data/ld-workbench inside the Hermes home of the profile you film with.
It refuses a folder that already has ballots, unless you pass --force; with --force it first copies
the old ballots.json beside it as ballots.json.bak-<time>. It writes ballots.json only."""
import json
import os
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "harness"))
sys.path.insert(0, str(ROOT))


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    force = "--force" in argv
    if len(args) != 1:
        print(__doc__)
        return 2
    target = Path(args[0]).expanduser().resolve()
    if target.name != "ld-workbench":
        print(f"Refusing {target}: point it at the plugin's own folder, plugin-data/ld-workbench.")
        return 2
    existing = target / "ballots.json"
    if existing.exists():
        try:
            had = len(json.loads(existing.read_text(encoding="utf-8")).get("history") or [])
        except (OSError, ValueError):
            had = -1
        if had and not force:
            print(f"{existing} already holds {had if had > 0 else 'unreadable'} ballots. Nothing written. Pass --force to back it up and replace it.")
            return 1
        backup = existing.with_name(f"ballots.json.bak-{int(time.time())}")
        shutil.copy2(existing, backup)
        print(f"Backed up the old ballots to {backup}")

    import make_fixtures as F  # sets LDW_DATA_DIR to a scratch folder on import; point it at the target after
    os.environ["LDW_DATA_DIR"] = str(target)
    import store

    take = F.drill_take()
    hist = F.history(F.extemp_ballot(take))
    for b in hist:
        b.pop("index", None)
        b.pop("take_id", None)  # the recording behind it is not part of the seed
    store.write("ballots.json", {"rounds_started": 6, "history": hist})
    print(f"Wrote {len(hist)} practice ballots to {target / 'ballots.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
