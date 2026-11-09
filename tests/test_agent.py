"""Inside Hermes: /debate, the two read-only agent tools, the three model rows and the bundled skill.

The rule these tests hold: an agent tool returns counts, tags, dates and question text only. A student's
words (transcripts, quoted lines) and a judge's prose (reason, summary, strengths, drill steps, the coach's
redo) never leave the Debate page through a tool or the command."""
import importlib
import json
import os
import subprocess
import sys
import time
import unittest
from pathlib import Path

from _load import ROOT, extemp, reset, store

agent = importlib.import_module("ld_workbench_dashboard_package.agent")

MARK = "ZEBRA-QUOKKA-7731"  # appears only in prose and transcripts, never in a question


def seed():
    reset()
    now = int(time.time())
    prose = {"reason": f"The 2AR dropped the NR turn. {MARK}", "summary": f"Close round {MARK}",
             "strengths": [f"Clear signposting {MARK}"], "framework": f"Neg won framework {MARK}",
             "ownership": f"Yes {MARK}", "show_me": {"text": f"Coach redo {MARK}"},
             "decisive": [{"speech": "2AR", "line": f"I said {MARK} in the 2AR", "effect": f"dropped {MARK}"}]}
    hist = []
    for i in range(6):
        hist.append({"event": "ld", "round_no": i + 1, "side": "aff", "decision": "neg" if i % 3 else "aff",
                     "resolution": "Resolved: civil disobedience in a democracy is morally justified.",
                     "speaker_points": {"student": 27.5, "opponent": 28.0},
                     "tags": ["dropped-2ar", f"made-up {MARK}"] if i < 4 else ["no-voters"],
                     "drills": [{"name": "Extend in the 2AR", "how": f"Say it twice {MARK}", "why": f"w {MARK}"}],
                     "at": now - (10 - i) * 86400, **prose})
    hist.append({"event": "drill", "answered": "partly", "points": 26.0, "tags": ["no-sources"],
                 "measured_tags": ["fillers", f"fake-{MARK}"], "measured": {"wpm": 150, "speaking": 58, "limit": 60},
                 "question": "Should the Federal Reserve care more about prices or about jobs right now?",
                 "drill": {"name": "Name one dated source", "how": f"Practice it {MARK}"}, "drill_segment": "answer",
                 "at": now - 3600, **prose})
    store.write("ballots.json", {"rounds_started": 6, "history": hist})
    store.write("practice.json", {"takes": [{"id": "t1", "event": "drill", "transcript": {"status": "done", "text": f"um so {MARK} jobs"}}]})
    store.write("round.json", {"transcript": [{"id": "AC", "speaker": "student", "text": f"My case {MARK}"}]})
    return hist


class Ctx:
    """Records what register() wires, the way Hermes's admission probe does."""

    def __init__(self, cron=None, skills=True):
        self.tools, self.commands, self.aux, self.skills = {}, {}, {}, {}
        self._cron = cron
        if not skills:
            self.register_skill = None

    def register_tool(self, name, toolset, schema, handler, **kw):
        self.tools[name] = {"toolset": toolset, "schema": schema, "handler": handler, **kw}

    def register_command(self, name, handler, description="", **kw):
        self.commands[name] = {"handler": handler, "description": description}

    def register_auxiliary_task(self, key, *, display_name, description, defaults=None, inherit_from=None):
        self.aux[key] = {"display_name": display_name, "description": description, "defaults": defaults}

    def register_skill(self, name, path, description="", frontmatter=None):
        self.skills[name] = Path(path)

    def current_cron_execution(self):
        return self._cron


def load_init():
    pkg = sys.modules["ld_workbench_dashboard_package"]
    return pkg


def wired(**kw):
    ctx = Ctx(**kw)
    load_init().register(ctx)
    return ctx


class Register(unittest.TestCase):
    def test_wires_the_command_the_two_tools_three_rows_and_the_skill(self):
        ctx = wired()
        self.assertEqual(set(ctx.tools), {"debate_record", "debate_today"})
        self.assertEqual(set(ctx.commands), {"debate"})
        self.assertEqual(set(ctx.aux), {"debate_judge", "debate_opponent", "debate_coach"})
        self.assertEqual({v["display_name"] for v in ctx.aux.values()}, {"Debate judge", "Debate opponent", "Debate coach"})
        for v in ctx.aux.values():
            self.assertEqual(v["defaults"], {"timeout": 180})  # no provider or model: the main model unless changed
        bundled = ROOT / "skills" / "debate-coach" / "SKILL.md"  # removable in one commit: then none is registered
        self.assertEqual(ctx.skills, {"debate-coach": bundled.resolve()} if bundled.is_file() else {})
        for t in ctx.tools.values():
            self.assertEqual(t["schema"]["name"] in ("debate_record", "debate_today"), True)
            self.assertFalse(t.get("override", False))

    def test_an_older_hermes_without_skills_or_rows_still_loads(self):
        class Old:
            def __init__(self):
                self.got = []

            def register_tool(self, name, *a, **k):
                self.got.append(name)

            def register_command(self, name, *a, **k):
                self.got.append(name)

            def register_auxiliary_task(self, *a, **k):
                raise ValueError("unknown")
        ctx = Old()
        load_init().register(ctx)
        self.assertEqual(sorted(ctx.got), ["debate", "debate_record", "debate_today"])

    def test_no_agent_tool_writes(self):
        src = (ROOT / "agent.py").read_text()
        for bad in ("store.write", "store.update", "ballots.add", "set_drill_done", "seen(", "delete", "open("):
            self.assertNotIn(bad, src, bad)
        self.assertNotIn("debate_add_question", src)


class NeverProse(unittest.TestCase):
    def setUp(self):
        seed()
        self.files = {p.name: p.stat().st_mtime_ns for p in Path(os.environ["LDW_DATA_DIR"]).iterdir()}

    def outputs(self):
        ctx = wired()
        rec = ctx.tools["debate_record"]["handler"]
        out = [rec({}), rec({"event": "ld", "recent": 20}), rec({"event": "extemp", "recent": 20}),
               rec({"event": "rhetoric"}), rec({"event": "bogus", "recent": "x"}),
               ctx.tools["debate_today"]["handler"]({}), ctx.commands["debate"]["handler"]("")]
        return out

    def test_the_marker_never_comes_back(self):
        for text in self.outputs():
            self.assertNotIn(MARK, text)
            self.assertNotIn("dropped the NR turn", text)
            self.assertNotIn("Say it twice", text)

    def test_nothing_is_written(self):
        self.outputs()
        after = {p.name: p.stat().st_mtime_ns for p in Path(os.environ["LDW_DATA_DIR"]).iterdir()}
        self.assertEqual(after, self.files)

    def test_record_counts_tags_dates_and_questions(self):
        r = json.loads(wired().tools["debate_record"]["handler"]({"recent": 20}))
        self.assertEqual(r["ballots"], 7)
        self.assertEqual(r["by_event"]["Lincoln-Douglas"], {"ballots": 6, "Won": 2, "Lost": 4})
        self.assertEqual(r["by_event"]["60-second answer"], {"ballots": 1, "Partly": 1})
        top = r["patterns"][0]
        self.assertEqual((top["pattern"], top["count"], top["of"]), ("You drop arguments in the 2AR", 4, 6))
        newest = r["recent"][0]
        self.assertEqual(newest["question"], "Should the Federal Reserve care more about prices or about jobs right now?")
        self.assertEqual(newest["tags"], ["You name no sources aloud", "You use more than 4 fillers a minute"])
        self.assertEqual((newest["result"], newest["points"]), ("Partly", 26.0))
        self.assertRegex(newest["date"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertEqual(set(newest), {"date", "event", "question", "result", "points", "tags", "drill_done"})
        self.assertEqual(r["recent"][1]["points"], 27.5)
        self.assertLessEqual(r["first"], r["last"])

    def test_record_by_event(self):
        h = wired().tools["debate_record"]["handler"]
        self.assertEqual(json.loads(h({"event": "ld"}))["ballots"], 6)
        ex = json.loads(h({"event": "extemp"}))
        self.assertEqual(ex["ballots"], 1)
        self.assertTrue(all(p["event"] != "Lincoln-Douglas" for p in ex["patterns"]))
        self.assertEqual(json.loads(h({"event": "rhetoric"}))["ballots"], 0)
        self.assertEqual(len(json.loads(h({"recent": 2}))["recent"]), 2)
        self.assertEqual(len(json.loads(h({"recent": 999}))["recent"]), 7)

    def test_empty_record(self):
        reset()
        r = json.loads(wired().tools["debate_record"]["handler"]({}))
        self.assertEqual((r["ballots"], r["patterns"], r["recent"], r["first"]), (0, [], [], None))
        self.assertIn("No pattern yet", wired().commands["debate"]["handler"](""))


class Today(unittest.TestCase):
    def setUp(self):
        seed()

    def test_today_is_the_question_the_floor_opens_on_and_reading_it_moves_nothing(self):
        before = store.read("questions.json")
        want = extemp.pool()[extemp.pool_start()]["text"]
        t = json.loads(wired().tools["debate_today"]["handler"]({}))
        self.assertEqual(t["question"], want)
        self.assertEqual(t["next_drill"], {"name": "Name one dated source", "event": "60-second answer"})
        self.assertEqual(store.read("questions.json"), before)
        extemp.seen()  # the floor was visited: the next question
        self.assertEqual(json.loads(wired().tools["debate_today"]["handler"]({}))["question"],
                         extemp.pool()[extemp.pool_start()]["text"])

    def test_slash_debate(self):
        out = wired().commands["debate"]["handler"]("")
        self.assertIn("Today's question: " + extemp.pool()[extemp.pool_start()]["text"], out)
        self.assertIn("Top pattern (Lincoln-Douglas): You drop arguments in the 2AR, 4 of your last 6 ballots.", out)
        self.assertLess(len(out), 600)

    def test_a_broken_data_file_reads_as_a_plain_sentence(self):
        orig = agent.ballots.history
        agent.ballots.history = lambda: (_ for _ in ()).throw(OSError("disk"))
        try:
            ctx = wired()
            self.assertIn("could not read", json.loads(ctx.tools["debate_record"]["handler"]({}))["error"])
            self.assertIn("could not read", ctx.commands["debate"]["handler"](""))
        finally:
            agent.ballots.history = orig


class Cron(unittest.TestCase):
    def test_both_tools_refuse_in_a_cron_run(self):
        seed()
        ctx = wired(cron=object())
        for name in ("debate_record", "debate_today"):
            out = json.loads(ctx.tools[name]["handler"]({}))
            self.assertEqual(out, {"error": agent.CRON_REFUSAL})

    def test_a_hermes_without_the_cron_call_is_not_treated_as_cron(self):
        class NoCron:
            pass
        self.assertFalse(agent._in_cron(NoCron()))
        self.assertFalse(agent._in_cron(None))


class Validator(unittest.TestCase):
    """Hermes's own admission probe (hermes_cli/plugin_validate.py), run against this folder with the system
    Python. It is read from Hermes's source when it is beside this repo; the hermes command is never run."""

    SRC = Path.home() / ".hermes" / "hermes-agent" / "hermes_cli"

    def test_the_admission_probe_sees_what_the_manifest_declares(self):
        validate = self.SRC / "plugin_validate.py"
        if not validate.is_file():
            self.skipTest("Hermes source not here")
        import ast
        import re
        tree = ast.parse(validate.read_text())
        script = next(n.value.value for n in tree.body if isinstance(n, ast.Assign)
                      and getattr(n.targets[0], "id", "") == "_PROBE_SCRIPT")
        methods = set()
        for f in ("plugins_context.py", "plugins_content.py"):
            methods |= set(re.findall(r"^\s*def ([a-z][a-z0-9_]*)\(", (self.SRC / f).read_text(), re.M))
        opts = json.dumps({"kind": "standalone", "context_methods": sorted(methods)})
        env = {k: v for k, v in os.environ.items() if not k.startswith("LDW_")}
        env["HERMES_HOME"] = os.environ["LDW_DATA_DIR"]
        out = subprocess.run([sys.executable, "-c", script, str(ROOT), "SENT:", opts], capture_output=True,
                             text=True, timeout=60, env=env, cwd=os.environ["LDW_DATA_DIR"])
        line = next(x for x in out.stdout.splitlines() if x.startswith("SENT:"))
        got = json.loads(line[5:])
        self.assertNotIn("error", got, got)
        self.assertEqual(sorted(got["tools"]), ["debate_record", "debate_today"])
        self.assertEqual((got["hooks"], got["middleware"]), ([], []))
        self.assertEqual(got["commands"], ["debate"])
        m = (ROOT / "plugin.yaml").read_text()
        self.assertIn("provides_tools: [debate_record, debate_today]", m)
        self.assertIn("provides_hooks: []", m)


class Catalog(unittest.TestCase):
    def test_the_old_line_is_gone_and_the_tools_are_declared(self):
        for f in ("docs/catalog/ld-workbench.yaml", "docs/catalog/PR-DESCRIPTION.md", "__init__.py"):
            text = (ROOT / f).read_text()
            self.assertNotIn("Registers no tools", text, f)
            self.assertNotIn("no tools, hooks or middleware", text, f)
        entry = (ROOT / "docs/catalog/ld-workbench.yaml").read_text()
        self.assertIn("provides_tools:\n    - debate_record\n    - debate_today\n", entry)


if __name__ == "__main__":
    unittest.main()
