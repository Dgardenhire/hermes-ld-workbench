"""The three model rows: every call names Debate judge, Debate opponent or Debate coach, and a Hermes that
refuses the row (or does not know the argument) gets today's plain call instead, with the path logged."""
import unittest

from _load import ROOT, Result, engine, run


class Constants(unittest.TestCase):
    def test_the_constants_name_the_rows(self):
        self.assertEqual((engine.TASK_JUDGE, engine.TASK_OPPONENT, engine.TASK_COACH),
                         ("debate_judge", "debate_opponent", "debate_coach"))
        self.assertEqual(set(engine.TASKS), {engine.TASK_JUDGE, engine.TASK_OPPONENT, engine.TASK_COACH})
        self.assertEqual({v[0] for v in engine.TASKS.values()}, {"Debate judge", "Debate opponent", "Debate coach"})


class TrustError(Exception):
    pass


TrustError.__name__ = "PluginLlmTrustError"


class Llm:
    """A facade that may refuse the row (refuse='trust' | 'type') or refuse everything (refuse='all')."""

    def __init__(self, refuse=None):
        self.refuse, self.calls = refuse, []

    async def _go(self, kind, kw):
        self.calls.append((kind, kw.get("task")))
        if kw.get("task") and self.refuse == "trust":
            raise TrustError(f"Plugin 'ld-workbench' cannot route through auxiliary task {kw['task']!r} — a plugin may only")
        if kw.get("task") and self.refuse == "type":
            raise TypeError("acomplete() got an unexpected keyword argument 'task'")
        if self.refuse == "all":
            raise TrustError("Plugin 'ld-workbench' cannot override the model")
        return Result('{"ok": 1}', {"ok": 1})

    async def acomplete(self, messages, **kw):
        return await self._go("text", kw)

    async def acomplete_structured(self, **kw):
        return await self._go("json", kw)


class Rows(unittest.TestCase):
    def test_purposes_map_to_rows(self):
        f = engine.task_for
        self.assertEqual(f("ld-workbench.judge"), "debate_judge")
        self.assertEqual(f("ld-workbench.extemp.judge"), "debate_judge")
        self.assertEqual(f("ld-workbench.drill.judge"), "debate_judge")
        self.assertEqual(f("ld-workbench.flow"), "debate_judge")
        self.assertEqual(f("ld-workbench.speech"), "debate_opponent")
        self.assertEqual(f("ld-workbench.cx"), "debate_opponent")
        for p in ("ld-workbench.coach.chat.extemp", "ld-workbench.briefing", "ld-workbench.tool.fallacies",
                  "ld-workbench.openings.coach", "ld-workbench", None):
            self.assertEqual(f(p), "debate_coach")

    def test_every_call_site_in_the_code_lands_on_a_row(self):
        import re
        for name in ("engine.py", "coach.py", "dashboard/plugin_api.py"):
            for p in re.findall(r'purpose=f?"([^"]+)"', (ROOT / name).read_text()):
                self.assertIn(engine.task_for(p.replace("{event}", "extemp")), engine.TASKS, p)

    def test_the_row_is_passed(self):
        llm = Llm()
        m = engine.Model(llm)
        run(m.json("s", "h", "b", purpose="ld-workbench.judge"))
        run(m.text("s", [], purpose="ld-workbench.speech"))
        run(m.text("s", [], purpose="ld-workbench.speech", task=engine.TASK_COACH))  # a call site's own row wins
        self.assertEqual(llm.calls, [("json", "debate_judge"), ("text", "debate_opponent"), ("text", "debate_coach")])
        self.assertEqual(m.last_route, ("debate_coach", "task"))

    def test_a_refused_row_falls_back_to_the_plain_call(self):
        for refuse, why in (("trust", "PluginLlmTrustError"), ("type", "TypeError")):
            llm = Llm(refuse)
            m = engine.Model(llm)
            with self.assertLogs("hermes.plugins.ld-workbench", "INFO") as logs:
                self.assertEqual(run(m.json("s", "h", "b", purpose="ld-workbench.judge")), {"ok": 1})
            self.assertEqual(llm.calls, [("json", "debate_judge"), ("json", None)])
            self.assertEqual(m.last_route, ("debate_judge", f"no-task: {why}"))
            self.assertTrue(any("model row debate_judge: no-task" in x for x in logs.output))
            self.assertEqual(run(m.text("s", [], purpose="ld-workbench.cx")), '{"ok": 1}')

    def test_other_trust_errors_still_reach_the_page(self):
        m = engine.Model(Llm("all"))
        with self.assertRaises(RuntimeError) as e:
            run(m.text("s", [], purpose="ld-workbench.cx"))
        self.assertIn("did not allow", str(e.exception))
        with self.assertRaises(RuntimeError):
            run(m.json("s", "h", "b"))


if __name__ == "__main__":
    unittest.main()
