"""The manifest, register(), and the built desktop bundle match what the catalog entry will claim."""
import re
import unittest

from _load import ROOT  # noqa: F401  (loads the package the way the dashboard does)


def manifest():
    out = {}
    for line in (ROOT / "plugin.yaml").read_text().splitlines():
        m = re.match(r"^([a-z_]+):\s*(.*)$", line)
        if m:
            out[m.group(1)] = m.group(2).strip().strip('"')
    return out


class Manifest(unittest.TestCase):
    def test_fields(self):
        m = manifest()
        self.assertEqual(m["manifest_version"], "2")
        self.assertEqual(m["name"], "ld-workbench")
        self.assertEqual(m["version"], "0.2.0")
        self.assertEqual(m["requires_hermes"], ">=0.22.0")  # nothing newer than v0.22.0 is used (DOCS-DIGEST floor table)
        self.assertEqual((m["provides_tools"], m["provides_hooks"]), ("[debate_record, debate_today]", "[]"))
        self.assertNotIn("capabilities", m)  # no LLM overrides, no tool overrides: nothing to consent to
        self.assertIn("/debate", m["description"])
        self.assertLess(len(m["description"]), 500)

    def test_register_matches_the_manifest(self):
        """register() adds exactly the declared tools, no hooks and no middleware (test_agent.py has the rest)."""
        import sys
        pkg = sys.modules["ld_workbench_dashboard_package"]
        calls = []

        class Ctx:
            def __getattr__(self, name):
                return lambda *a, **k: calls.append((name, a[0] if a else k.get("name")))
        pkg.register(Ctx())
        tools = sorted(n for kind, n in calls if kind == "register_tool")
        self.assertEqual(tools, ["debate_record", "debate_today"])
        self.assertEqual(tuple(sorted(pkg.TOOLS)), tuple(tools))
        self.assertEqual(pkg.HOOKS, ())
        self.assertFalse(any(kind in ("register_hook", "register_middleware") for kind, _ in calls))
        self.assertIn(("register_command", "debate"), calls)


class Bundle(unittest.TestCase):
    def setUp(self):
        self.code = (ROOT / "desktop" / "plugin.js").read_text(encoding="utf-8")

    def test_only_allowed_imports(self):
        sources = set(re.findall(r"^\s*import\s[\s\S]*?\sfrom\s*[\"']([^\"']+)[\"']", self.code, re.M))
        self.assertEqual(sources - {"@hermes/plugin-sdk", "react", "react/jsx-runtime"}, set())

    def test_browser_speech_recognition_is_gone(self):
        self.assertNotIn("webkitSpeechRecognition", self.code)  # it would send a minor's audio to Google, if it worked at all
        self.assertNotIn("Speak instead of type", self.code)

    def test_no_raw_html_or_eval(self):
        for bad in ("innerHTML", "dangerouslySetInnerHTML", "eval(", "new Function("):
            self.assertNotIn(bad, self.code)

    def test_source_and_bundle_agree_on_the_routes(self):
        api_src = (ROOT / "dashboard" / "plugin_api.py").read_text()
        for path in ("speech/take", "headlines/pull", "extemp/draw", "rhetoric/marks", "rhetoric/spot", "home"):
            self.assertIn(f'"/{path}"', api_src)
            self.assertTrue(f"'{path}'" in self.code or f'"{path}"' in self.code, path)


    def test_extemp_file_items_have_a_remove_control_with_a_confirm(self):
        api_src = (ROOT / "dashboard" / "plugin_api.py").read_text()
        self.assertIn('"/extemp/file/{item_id}/delete"', api_src)
        self.assertIn("/delete`", self.code)
        self.assertIn("extemp/file/${encodeURIComponent(item.id)}/delete", self.code)
        self.assertIn("Remove it from your file for good?", self.code)


if __name__ == "__main__":
    unittest.main()
