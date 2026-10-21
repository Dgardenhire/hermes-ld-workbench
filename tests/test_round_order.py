import unittest

from _load import room, M


def start(side="aff"):
    return room.new_round(side=side, level="jv", judge="traditional", resolution="Resolved: X.",
                          case={"Value": "Morality.", "Blocks": "not read"}, round_no=1)


class RoundOrder(unittest.TestCase):
    def test_nsda_order_and_times(self):
        self.assertEqual([(s["id"], s["minutes"]) for s in M.ROUND],
                         [("AC", 6), ("CX1", 3), ("NC", 7), ("CX2", 3), ("1AR", 4), ("NR", 6), ("2AR", 3)])
        self.assertEqual(M.PREP_MINUTES, 4)
        self.assertEqual(start()["prep"], 240)

    def test_case_loads_into_constructive_without_blocks(self):
        self.assertEqual(start("aff")["drafts"], {"AC": "Morality."})
        self.assertEqual(start("neg")["drafts"], {"NC": "Morality."})

    def test_full_round_as_aff(self):
        r = start("aff")
        self.assertEqual(room.speaker_of(room.current(r), "aff"), "student")
        room.finish_speech(r, "AC", "student", "my case")
        self.assertEqual(room.current(r)["id"], "CX1")
        self.assertEqual(room.speaker_of(room.current(r), "aff"), "ai")  # the neg asks
        room.cx_add(r, "neg", True, "Q?")
        room.cx_add(r, "aff", False, "A.")
        room.end_cx(r)
        room.finish_speech(r, "NC", "ai", "their case")
        room.cx_add(r, "aff", True, "My Q?")
        room.end_cx(r)
        room.finish_speech(r, "1AR", "student", "1ar")
        room.finish_speech(r, "NR", "ai", "nr")
        self.assertEqual(r["phase"], "live")
        room.finish_speech(r, "2AR", "student", "2ar")
        self.assertEqual(r["phase"], "judging")
        self.assertIsNone(room.current(r))
        self.assertIn("--- CX1 (NEG asks) ---\nQ (NEG): Q?\nA (AFF): A.", room.cx_log(r))

    def test_out_of_turn_moves_are_refused(self):
        r = start("aff")
        with self.assertRaises(ValueError):
            room.finish_speech(r, "NC", "ai", "jumping ahead")
        with self.assertRaises(ValueError):
            room.finish_speech(r, "AC", "ai", "the AI cannot give my speech")
        with self.assertRaises(ValueError):
            room.end_cx(r)
        with self.assertRaises(ValueError):
            room.finish_speech(r, "AC", "student", "   ")
        room.finish_speech(r, "AC", "student", "ok")
        with self.assertRaises(ValueError):
            room.finish_speech(r, "1AR", "student", "not yet")

    def test_neg_student_speaks_nc_nr(self):
        r = start("neg")
        self.assertEqual(room.speaker_of(room.current(r), "neg"), "ai")
        r["i"] = 2
        self.assertEqual(room.speaker_of(room.current(r), "neg"), "student")

    def test_prep_only_goes_down(self):
        r = start()
        room.set_prep(r, 200)
        room.set_prep(r, 500)
        self.assertEqual(r["prep"], 200)
        room.set_prep(r, -5)
        self.assertEqual(r["prep"], 0)

    def test_redo_only_own_speech_after_ballot(self):
        r = start("aff")
        room.finish_speech(r, "AC", "student", "v1")
        with self.assertRaises(ValueError):
            room.redo(r, "AC", "v2")
        room.add_ballot(r, {"decision": "neg"})
        room.redo(r, "AC", "v2")
        self.assertEqual(r["transcript"][0]["text"], "v2")
        with self.assertRaises(ValueError):
            room.redo(r, "NC", "not mine")


if __name__ == "__main__":
    unittest.main()
