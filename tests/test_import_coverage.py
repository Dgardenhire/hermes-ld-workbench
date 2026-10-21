import json
import unittest

from _load import engine, M, fake_model, run

CASE = """I affirm the resolution: Resolved: De-extinction is unethical.
Definitions
De-extinction means bringing back an extinct species through cloning or gene editing.
Value
My value is morality, because the resolution asks whether an action is ethical.
Criterion
My criterion is minimizing suffering. Suffering is the clearest measure of moral harm to living beings.
Contention 1: Animal welfare
Most cloned animals die before or soon after birth. The bucardo clone lived only minutes. That suffering is certain while the benefits are speculative.
For these reasons I urge an affirmative ballot."""


class ImportCoverage(unittest.TestCase):
    def test_chunks_rebuild_word_for_word(self):
        chunks = engine.chunk_case(CASE)
        self.assertEqual("".join(c + s for c, s in chunks).split(), CASE.split())

    def test_good_labels_keep_every_word(self):
        chunks = engine.chunk_case(CASE)
        assign = {str(i): ("Value" if "value" in c.lower() else "Other material") for i, (c, _) in enumerate(chunks)}
        out = engine.assemble_sections(CASE, chunks, assign)
        self.assertFalse(out["verbatim_fallback"])
        self.assertEqual(sorted(" ".join(out["sections"].values()).split()), sorted(CASE.split()))
        self.assertIn("Value", out["sections"])

    def test_unknown_labels_land_in_other_material(self):
        chunks = engine.chunk_case(CASE)
        out = engine.assemble_sections(CASE, chunks, {"0": "Made up section"})
        self.assertEqual(list(out["sections"]), ["Other material"])

    def test_coverage_failure_falls_back_to_verbatim(self):
        # If rebuilding ever loses or changes a word, the student's text comes back untouched.
        chunks = engine.chunk_case(CASE)
        chunks[1][0] = chunks[1][0] + " invented"
        out = engine.assemble_sections(CASE, chunks, {})
        self.assertTrue(out["verbatim_fallback"])
        self.assertEqual(out["sections"], {"Other material": CASE})

    def test_detect_side_from_own_words(self):
        self.assertEqual(engine.detect_side(CASE), "aff")
        self.assertEqual(engine.detect_side("I negate. " * 5), "neg")
        self.assertEqual(engine.detect_side("I affirm. I negate."), "unknown")

    def test_run_import_uses_model_labels_only(self):
        llm = fake_model()
        chunks = engine.chunk_case(CASE)
        llm.queue.append(json.dumps({"assign": {str(i): "Contention 1" for i in range(len(chunks))}}))
        p = engine.clean({"action": "import", "text": CASE})
        out = run(engine.run_import(p, engine.Model(llm)))
        self.assertFalse(out["verbatim_fallback"])
        self.assertEqual(out["sections"]["Contention 1"].split(), CASE.split())
        self.assertEqual(llm.calls[0]["system_prompt"], M.IMPORT_PROMPT)

    def test_too_short(self):
        with self.assertRaises(RuntimeError):
            run(engine.run_import(engine.clean({"action": "import", "text": "too short"}), engine.Model(fake_model())))


if __name__ == "__main__":
    unittest.main()
