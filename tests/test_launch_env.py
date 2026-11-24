"""Every program launch in this repository says what environment it gets, so a provider key in Hermes's (or a
developer's) environment cannot reach it by inheritance.

A static read of the files, no program is started: each ``subprocess`` call in the plugin's Python and in the
harness's embedded Python names ``env=``; each ``spawn`` in the harness's JavaScript names ``env:``; and each harness
shell script restarts itself on a short list of settings before it runs anything. A new launch that forgets fails
here with its file and line."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY_LAUNCH = re.compile(r"subprocess\.(run|Popen|call|check_call|check_output)\(")
JS_LAUNCH = re.compile(r"\b(spawn|spawnSync|execFile|execFileSync|exec|execSync|fork)\(")
CLEAN_START = '[ -n "$LDW_HARNESS_CLEAN" ] || exec env -i '


def calls(text, pattern):
    """(line number, the call's text up to its closing parenthesis) for each match."""
    for m in pattern.finditer(text):
        depth, i = 0, m.end() - 1
        while i < len(text):
            depth += {"(": 1, ")": -1}.get(text[i], 0)
            if depth == 0:
                break
            i += 1
        yield text[:m.start()].count("\n") + 1, text[m.start():i + 1]


def shipped(pattern):
    skip = {"tests", "vendor", "node_modules", ".git"}
    return [p for p in sorted(ROOT.rglob(pattern)) if not skip & set(p.relative_to(ROOT).parts)]


class EveryLaunchNamesItsEnvironment(unittest.TestCase):
    def test_python(self):
        problems = []
        for path in shipped("*.py") + shipped("*.sh"):
            for line, call in calls(path.read_text(encoding="utf-8"), PY_LAUNCH):
                if "env=" not in call:
                    problems.append(f"{path.relative_to(ROOT)}:{line}")
        self.assertEqual(problems, [], "launches that would inherit the whole environment")

    def test_harness_javascript(self):
        problems = []
        for path in shipped("*.mjs") + shipped("*.sh") + [p for p in shipped("*.js") if p.parent.name == "harness"]:
            text = path.read_text(encoding="utf-8")
            if "child_process" not in text:
                continue
            for line, call in calls(text, JS_LAUNCH):
                if "env:" not in call:
                    problems.append(f"{path.relative_to(ROOT)}:{line}")
        self.assertEqual(problems, [], "launches that would inherit the whole environment")

    def test_harness_shell_scripts_start_clean(self):
        for path in shipped("*.sh"):
            text = path.read_text(encoding="utf-8")
            first_command = next(l for l in text.splitlines()[1:] if l.strip() and not l.startswith("#"))
            self.assertTrue(first_command.startswith(CLEAN_START), f"{path.relative_to(ROOT)} runs on the caller's environment")

    def test_the_scan_sees_a_launch_without_env(self):
        bad = "import subprocess\nsubprocess.run(['ffmpeg', '-i', 'x'],\n    check=True)\n"
        good = "import subprocess\nsubprocess.run(['ffmpeg'], env={'PATH': '/usr/bin'})\n"
        self.assertEqual([n for n, c in calls(bad, PY_LAUNCH) if "env=" not in c], [2])
        self.assertEqual([n for n, c in calls(good, PY_LAUNCH) if "env=" not in c], [])
        js = "const c = spawn(CHROME, ['--headless'], { stdio: 'ignore' })\n"
        self.assertEqual([n for n, c in calls(js, JS_LAUNCH) if "env:" not in c], [1])


if __name__ == "__main__":
    unittest.main()
