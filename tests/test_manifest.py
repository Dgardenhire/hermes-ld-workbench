"""The manifest, register(), and the built desktop bundle match what the catalog entry will claim."""
import importlib.util
import re
import unittest

from _load import ROOT


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
        self.assertEqual((m["provides_tools"], m["provides_hooks"]), ("[]", "[]"))
        self.assertNotIn("capabilities", m)  # no LLM overrides, no tool overrides: nothing to consent to

    def test_register_adds_nothing(self):
        spec = importlib.util.spec_from_file_location("ldw_init", ROOT / "__init__.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        calls = []

        class Ctx:
            def __getattr__(self, name):
                return lambda *a, **k: calls.append(name)
        mod.register(Ctx())
        self.assertEqual(calls, [])
        self.assertEqual((mod.TOOLS, mod.HOOKS), ((), ()))


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


if __name__ == "__main__":
    unittest.main()
