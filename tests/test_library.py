import io
import json
import os
import unittest
import zipfile
from pathlib import Path

from _load import api, library, fake_model, reset, run


class Library(unittest.TestCase):
    def setUp(self):
        reset()
        fake_model()

    def test_create_rename_duplicate_delete(self):
        a = library.create(name="Animal welfare AC", resolution="Resolved: De-extinction is unethical.", side="aff")
        b = library.create(name="", resolution="R", side="neg")
        self.assertEqual(b["name"], "Untitled negative case")
        library.rename(a["id"], "  Welfare   AC ")
        self.assertEqual(library.get(a["id"])["name"], "Welfare AC")
        library.change(a["id"], lambda c: c["sections"].__setitem__("Value", "Morality"))
        d = library.duplicate(a["id"])
        self.assertEqual(d["name"], "Welfare AC (copy)")
        self.assertEqual(d["sections"], {"Value": "Morality"})
        self.assertNotEqual(d["id"], a["id"])
        ids = [c["id"] for c in library.list_cases()]
        self.assertEqual(set(ids), {a["id"], b["id"], d["id"]})
        self.assertEqual(ids[0], d["id"])  # newest edit first (ties broken by creation)
        library.delete(b["id"])
        self.assertNotIn(b["id"], [c["id"] for c in library.list_cases()])
        with self.assertRaises(ValueError):
            library.get(b["id"])
        with self.assertRaises(ValueError):
            library.rename(a["id"], "x" * 81)
        with self.assertRaises(ValueError):
            library.get("../workbench")

    def test_each_case_is_its_own_file(self):
        a = library.create(name="One")
        self.assertTrue((Path(os.environ["LDW_DATA_DIR"]) / "cases" / f"{a['id']}.json").is_file())

    def test_sorted_by_last_edited(self):
        a = library.create(name="A")
        b = library.create(name="B")
        a["updated"] += 100
        library.save(a, touch=False)
        self.assertEqual(library.list_cases()[0]["id"], a["id"])
        b["updated"] = a["updated"] + 50
        library.save(b, touch=False)
        self.assertEqual(library.list_cases()[0]["id"], b["id"])

    def test_routes_switch_and_delete(self):
        first = run(api.get_state())["workbench"]["case"]["id"]
        st = run(api.post_case_create({"name": "Second", "side": "neg"}))
        self.assertEqual(st["case"]["name"], "Second")
        self.assertEqual(len(st["cases"]), 2)
        st = run(api.post_case_open(first))
        self.assertEqual(st["case"]["id"], first)
        st = run(api.post_case_delete(first))
        self.assertEqual(st["case"]["name"], "Second")

    def test_docx_export_is_a_valid_document(self):
        c = library.create(name="Export test", resolution="Resolved: De-extinction is unethical.", side="aff",
                           sections={"Contention 1": "Clones suffer & die.", "Value": "Morality <first>"})
        path = library.export(c["id"], "docx")
        with zipfile.ZipFile(path) as z:
            self.assertIsNone(z.testzip())
            names = set(z.namelist())
            self.assertTrue({"[Content_Types].xml", "_rels/.rels", "word/document.xml"} <= names)
            doc = z.read("word/document.xml").decode()
        self.assertIn("Clones suffer &amp; die.", doc)
        self.assertIn("Morality &lt;first&gt;", doc)
        self.assertLess(doc.index(">Value<"), doc.index(">Contention 1<"))  # reading order
        import xml.dom.minidom
        xml.dom.minidom.parseString(doc)  # well-formed

    def test_txt_export(self):
        c = library.create(name="T", resolution="R", side="neg", sections={"Value": "Justice"})
        text = Path(library.export(c["id"], "txt")).read_text()
        self.assertIn("Negative case", text)
        self.assertIn("VALUE\nJustice", text)

    def test_backup_round_trip_never_overwrites(self):
        a = library.create(name="Kept", resolution="R", side="aff", sections={"Value": "Life"})
        path = library.export_backup()
        data = json.loads(Path(path).read_text())
        self.assertEqual(data["format"], "ld-workbench-backup")
        st = run(api.post_backup_import({"text": json.dumps(data)}))
        self.assertGreaterEqual(st["added"], 1)
        names = [c["name"] for c in library.list_cases()]
        self.assertEqual(names.count("Kept"), 2)
        self.assertEqual(library.get(a["id"])["sections"], {"Value": "Life"})
        with self.assertRaises(ValueError):
            library.import_backup({"cases": []})


if __name__ == "__main__":
    unittest.main()
