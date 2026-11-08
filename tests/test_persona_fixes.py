"""The persona test's ranked fixes (Nov 8, 2026): questions a coach can hand out and a pool that rotates,
fallacy quotes checked like ballot quotes, a readable extemp ballot, ballots a coach can use, the flow beside
the clock, pace judged by the judge chosen, on-topic headlines, the narrow layout, choices that show, and
harness fixtures that match their screens."""
import json
import re
import unittest

from _load import ROOT, api, ballots, engine, extemp, fake_model, headlines, reset, room, run, store

BUNDLE = (ROOT / "desktop" / "plugin.js").read_text(encoding="utf-8")
SRC = {p.name: p.read_text(encoding="utf-8") for p in (ROOT / "desktop" / "src").glob("*.js")}
FED = "Should the Federal Reserve care more about prices or about jobs right now?"


class QuestionPool(unittest.TestCase):
    def setUp(self):
        reset()

    def test_forty_or_more_low_partisan_questions_across_the_areas(self):
        qs = extemp.STARTER
        self.assertGreaterEqual(len(qs), 40)
        self.assertEqual(qs[0]["text"], FED)  # a fresh profile, and the film, open on it
        for area in ("us", "international"):
            self.assertGreaterEqual(sum(q["area"] == area for q in qs), 15, area)
        topics = {q["topic"] for q in qs}
        for t in ("economy", "courts", "congress", "elections", "foreign policy"):
            self.assertIn(t, topics)
        self.assertGreaterEqual(len(topics - {"economy", "states", "courts", "congress", "elections", "foreign policy", "world economy"}), 5)  # regions
        self.assertEqual(len({q["text"].lower() for q in qs}), len(qs))
        for q in qs:
            self.assertTrue(q["text"].endswith("?"), q)
            self.assertLessEqual(len(q["text"].split()), 25, q)
            low = q["text"].lower()
            for word in ("republican", "democrat", "trump", "biden", "gop", "liberal", "conservative", "maga", "woke", "left-wing", "right-wing"):
                self.assertNotIn(word, low, q)

    def test_the_first_question_moves_on_every_visit(self):
        seen = []
        for _ in range(6):
            home = run(api.get_home())
            seen.append(home["pool"][home["pool_start"]]["text"])
            run(api.post_extemp_questions_seen())
        self.assertEqual(seen[0], FED)
        self.assertTrue(all(a != b for a, b in zip(seen, seen[1:])), seen)
        self.assertEqual(len(set(seen)), 6)

    def test_a_coach_adds_questions_and_asks_only_those(self):
        with self.assertRaises(Exception):
            run(api.post_extemp_questions({"mine_only": True}))  # nothing of their own yet
        out = run(api.post_extemp_questions({"text": "Should our state require a semester of personal finance to graduate", "area": "us"}))
        self.assertEqual(out["added"]["text"], "Should our state require a semester of personal finance to graduate?")
        run(api.post_extemp_questions({"text": "Can the Arctic Council keep working with every member at the table?", "area": "international"}))
        view = run(api.post_extemp_questions({"mine_only": True}))
        self.assertTrue(view["mine_only"])
        pool = run(api.get_home())["pool"]
        self.assertEqual([q["own"] for q in pool], [True, True])
        self.assertEqual(pool[0]["area"], "international")  # newest first
        run(api.post_extemp_question_delete(pool[0]["id"]))
        run(api.post_extemp_question_delete(pool[1]["id"]))
        self.assertFalse(run(api.get_extemp_questions())["mine_only"])  # no questions of their own left
        self.assertEqual(len(run(api.get_home())["pool"]), len(extemp.STARTER))

    def test_built_in_questions_hide_and_come_back(self):
        qid = extemp.question_id(FED)
        run(api.post_extemp_question_delete(qid))
        self.assertNotIn(FED, [q["text"] for q in run(api.get_home())["pool"]])
        self.assertTrue(next(q for q in run(api.get_extemp_questions())["questions"] if q["id"] == qid)["hidden"])
        run(api.post_extemp_questions({"text": FED.lower(), "area": "us"}))  # adding a built-in one shows it again
        self.assertIn(FED, [q["text"] for q in run(api.get_home())["pool"]])
        run(api.post_extemp_question_delete(qid))
        run(api.post_extemp_questions_restore())
        self.assertIn(FED, [q["text"] for q in run(api.get_home())["pool"]])
        with self.assertRaises(Exception):
            run(api.post_extemp_question_delete("qnothere"))
        with self.assertRaises(Exception):
            run(api.post_extemp_questions({"text": "Too short", "area": "us"}))

    def test_every_hidden_still_leaves_a_pool(self):
        store.update("questions.json", lambda q: (q.__setitem__("hidden", [extemp.question_id(s["text"]) for s in extemp.STARTER]), q)[1])
        self.assertEqual(len(run(api.get_home())["pool"]), len(extemp.STARTER))

    def test_the_page_offers_your_own_question_in_every_mode_and_keeps_it(self):
        x = SRC["extemp.js"]
        self.assertEqual(x.count("tools: jsx(QuestionTools"), 2)  # the 60-second answer and the openings lab
        self.assertIn("Or prep a question of your own", x)  # the full round, always, not only when the draw fails
        self.assertNotIn("drawn && drawn.fallback ? jsxs('section', { className: 'ldw-panel', children: [\n      jsx(Notice, { tone: 'warn', children: `${drawn.notice} Write your own question from these headlines.` }),\n      jsx('ul', { className: 'ldw-list', children: drawn.headlines.map((h, k) => jsx('li', { children: h }, k)) }),\n      jsxs('div', { className: 'hk-row'", x)
        self.assertEqual(x.count("const q = useQuestion()"), 2)  # both floors read the one shared question
        self.assertIn("const [own, setOwn] = useState(held ? held.text : '')", x)  # the full round starts from it
        self.assertIn("The draw writes three questions from this week", x)  # why Draw is off, and what to do
        self.assertIn("'aria-describedby': !fileCount && !pull ? 'ldw-draw-why'", x)
        self.assertIn("Write your own", BUNDLE)
        self.assertIn("Ask only my questions", BUNDLE)

    def test_the_rail_names_the_mode(self):
        self.assertIn("xmode === 'openings' ? 'Openings' : xmode === 'round'", SRC["plugin.js"])


class FallacyQuotes(unittest.TestCase):
    SPEECH = ("If we let students choose their own reading, next they will want to choose their own grades, "
              "and soon schools will have no standards at all. Either we keep the list or we give up on literacy.")

    def test_found_quotes_pass_in_any_case_spacing_or_quote_marks(self):
        ans = ("1. **Slippery slope**\n\n   **Exact words:** “if we let  students choose their own reading”\n\n"
               "2. **False dilemma**\n   Exact words: \"Either we keep the list ... we give up on literacy.\"\n"
               "   **Cross-examination question:** \"Why only two choices here?\"")
        text, quotes = engine.check_quotes(self.SPEECH, ans)
        self.assertEqual([q["found"] for q in quotes], [True, True])
        self.assertNotIn(engine.NOT_FOUND, text)

    def test_a_quote_nobody_said_is_marked_on_its_line(self):
        ans = "1. **Ad hominem**\n\n   **Exact words:**\n   \"The people pushing this never did well in school.\"\n\n2. **Slippery slope**\n   Quote: \"soon schools will have no standards at all\""
        text, quotes = engine.check_quotes(self.SPEECH, ans)
        self.assertEqual([q["found"] for q in quotes], [False, True])
        lines = text.split("\n")
        self.assertTrue(lines[3].endswith(engine.NOT_FOUND))  # the quote's own line, under its label
        self.assertEqual(text.count(engine.NOT_FOUND), 1)

    def test_a_model_cannot_plant_or_hide_the_mark(self):
        text, _ = engine.check_quotes(self.SPEECH, "Exact words: \"next they will want to choose their own grades\" [[not-found]]")
        self.assertNotIn(engine.NOT_FOUND, text)

    def test_spot_routes_check_against_the_speech_and_keep_the_mark(self):
        llm = fake_model()
        run(api.get_state())
        llm.queue.append("1. **Straw man**\n   Exact words: \"students should never read anything\"")
        out = run(api.post_spot({"text": self.SPEECH}))
        self.assertIn(engine.NOT_FOUND, out["text"])
        self.assertEqual(out["quotes"], [{"quote": "students should never read anything", "found": False}])
        self.assertIn(engine.QUOTE_FORMAT, llm.calls[-1]["messages"][0]["content"])
        r = room.new_round(side="aff", level="jv", judge="traditional", resolution="Resolved: X.", case={}, round_no=1)
        r["pending_ai"] = {"id": "NC", "text": self.SPEECH}
        store.write("round.json", r)
        llm.queue.append("Exact words: \"next they will want to choose their own grades\"\nExact words: \"a line from another speech entirely\"")
        out = run(api.post_spot({"speech_id": "NC"}))
        self.assertEqual([q["found"] for q in out["quotes"]], [True, False])
        self.assertEqual(store.read("round.json")["spots"]["NC"].count(engine.NOT_FOUND), 1)  # still marked after a reload

    def test_the_own_case_fallacy_tool_checks_against_the_case(self):
        llm = fake_model()
        cid = run(api.get_state())["workbench"]["case"]["id"]
        llm.queue.append("Exact words: \"a sentence that is not in the case at all\"")
        out = run(api.post_tool({"case_id": cid, "tool": "fallacies", "section": "Value", "under_section": True}))
        self.assertIn(engine.NOT_FOUND, json.dumps(out))

    def test_the_page_shows_the_mark_and_says_how_many(self):
        self.assertIn("ldw-inline-flag", BUNDLE)
        self.assertIn("Every quote was checked", BUNDLE)
        self.assertIn("text ? jsx(FallaciesFound, { text, where: 'in the speech' })", SRC["plugin.js"])
        self.assertIn("out ? jsx(FallaciesFound, { text: out, where: 'in what you pasted' })", SRC["plugin.js"])


class ExtempBallot(unittest.TestCase):
    def setUp(self):
        reset()

    def test_the_boxes_are_labeled_and_the_points_explained(self):
        self.assertIn("children: 'Answered the question?'", SRC["floor.js"])
        m = re.search(r"extemp: '([^']+)'", SRC["floor.js"])
        self.assertIn(extemp.POINTS_SCALE, m.group(1))  # the student's key is the judge's scale
        self.assertIn(extemp.POINTS_SCALE, extemp.JUDGE_PROMPT.format(tags="x", points=extemp.POINTS_SCALE))
        ld = re.search(r"ld: '([^']+)'", SRC["floor.js"]).group(1)
        anchor = engine.LD_TAGS_RULE.split("Speaker points: ")[1].strip()
        self.assertIn(anchor, ld)

    def test_the_judge_knows_when_the_file_is_empty(self):
        llm = fake_model()
        take = {"stats": {"speaking": 55, "wpm": 140}, "transcript": {"status": "done", "text": "my answer is yes"}, "limit": 60}
        llm.queue.append(json.dumps({"answered": "yes", "points": 27, "summary": "s", "decisive": [], "reason": "r", "drill": {"name": "d", "how": "h"}, "tags": []}))
        run(engine.run_extemp_judge(take, FED, {}, [], api.MODEL, "drill", 0))
        call = llm.calls[-1]
        self.assertIn("SOURCES SAVED IN THE STUDENT'S EXTEMP FILE: 0", json.dumps(call))
        self.assertIn('never send them to \\"your file\\"', json.dumps(call))

    def test_a_drill_that_says_your_file_is_explained_when_there_is_none(self):
        self.assertIn("fileEmpty && mentionsFile(home.next_drill)", SRC["extemp.js"])
        self.assertIn("Your file is empty for now", BUNDLE)

    def test_the_floor_shows_only_extemp_drills(self):
        ballots.add({"event": "drill", "answered": "yes", "drill": {"name": "Lead with the answer", "how": "x"}, "tags": []})
        ballots.add({"event": "ld", "decision": "neg", "side": "aff", "drills": [{"name": "Answer-or-drop audit", "why": "w", "how": "h"}]})
        self.assertEqual(ballots.next_drill()["name"], "Answer-or-drop audit")
        self.assertEqual(run(api.get_home())["next_drill"]["name"], "Lead with the answer")


class CoachBallots(unittest.TestCase):
    def setUp(self):
        reset()

    def test_every_ballot_saves_as_text_for_a_coach(self):
        ballots.add({"event": "drill", "question": FED, "answered": "partly", "points": 26.5, "tags": ["no-sources"], "measured_tags": ["late-answer"],
                     "measured": {"speaking": 58, "limit": 60, "wpm": 150}, "reason": "You answered late.",
                     "decisive": [{"line": "my answer is prices", "effect": "late", "checked": False}],
                     "drill": {"name": "Answer first", "how": "Say it in ten seconds."}, "at": 1762570000})
        ballots.add({"event": "ld", "round_no": 3, "decision": "neg", "side": "aff", "judge": "Flow judge", "resolution": "Resolved: X.",
                     "speaker_points": {"student": 27.5, "opponent": 28.0}, "tags": ["dropped-2ar"], "reason": "You dropped the NR.",
                     "decisive": [{"speech": "NR", "line": "tools save living species", "effect": "dropped", "checked": True}],
                     "drills": [{"name": "Extend", "why": "w", "how": "Redo the 2AR."}], "drill_done": True, "at": 1762580000})
        out = run(api.post_ballots_export({}))
        self.assertEqual(out["count"], 2)
        text = (store.data_dir() / "exports" / out["name"]).read_text(encoding="utf-8")
        self.assertLess(text.index("Lincoln-Douglas"), text.index("60-second answer"))  # newest first
        for part in ("Lost on the affirmative", "Speaker points: 27.5", "You dropped the NR.", "Drill (done): Extend",
                     "Partly answered the question", "26.5 points", "0:58 spoken of 1:00", "Your answer comes late",
                     "[not found in what was said; check it]", FED):
            self.assertIn(part, text)
        with self.assertRaises(Exception):
            run(api.post_ballots_export({"path": "/etc/ballots.txt"}))  # only inside the home folder

    def test_rows_open_print_and_explain_the_chips(self):
        b = SRC["ballotsview.js"]
        self.assertIn("jsxs('button', { type: 'button', className: 'ldw-brow-main', 'aria-expanded': open", b)
        self.assertIn("open ? jsx('div', { className: 'ldw-brow-sheet', children: jsx(FullSheet", b)
        self.assertIn("The judge wrote it on that ballot", b)  # on the page, not only in a tooltip
        self.assertIn("'Print ballots'", b)
        self.assertIn("post('ballots/export'", b)
        self.assertIn("jsx('h1', { className: 'ldw-set-h1', children: 'Ballots' })", b)


class Rebuttals(unittest.TestCase):
    def test_the_flow_sits_beside_the_clock_in_rebuttals(self):
        p = SRC["plugin.js"]
        self.assertIn("beside: flowBeside && r.transcript.some(t => t.speaker === 'ai') ? jsx(FlowBeside", p)
        self.assertIn("const [flowBeside, setFlowBeside] = useState(true)", p)  # on by default
        self.assertIn("The flow so far", BUNDLE)
        self.assertIn("Hide the flow", BUNDLE)


class Pace(unittest.TestCase):
    def setUp(self):
        reset()

    def test_speed_counts_only_against_judges_who_mind_it(self):
        fast = {"wpm": 190, "speaking": 230}
        self.assertIn("pace-fast", ballots.measured_tags(fast, 240, "ld", "traditional"))
        self.assertIn("pace-fast", ballots.measured_tags(fast, 240, "ld", "lay"))
        self.assertNotIn("pace-fast", ballots.measured_tags(fast, 240, "ld", "flow"))
        self.assertNotIn("pace-fast", ballots.measured_tags(fast, 240, "ld", "circuit"))
        self.assertIn("pace-slow", ballots.measured_tags({"wpm": 100, "speaking": 230}, 240, "ld", "flow"))

    def _judged(self, judge):
        fake_model()
        r = room.new_round(side="aff", level="jv", judge=judge, resolution="Resolved: X.", case={"Value": "v"}, round_no=1)
        for sid, who, text in (("AC", "student", "ac"), ("NC", "ai", "nc"), ("1AR", "student", "1ar"), ("NR", "ai", "tools save living species"), ("2AR", "student", "2ar")):
            if room.current(r)["kind"] == "cx":
                room.end_cx(r)
            room.finish_speech(r, sid, who, text)
        r["spoken"] = {"1AR": {"wpm": 192, "speaking": 230}}
        store.write("round.json", r)
        return run(api.post_round_judge({}))["ballots"][-1]

    def test_the_round_ballot_uses_the_judge(self):
        self.assertIn("pace-fast", self._judged("traditional")["measured_tags"])
        self.assertNotIn("pace-fast", self._judged("flow")["measured_tags"])

    def test_a_circuit_judge_can_be_chosen(self):
        self.assertIn("circuit", engine.config()["judges"])
        self.assertIn("theory", engine.config()["judges"]["circuit"]["summary"])
        b = self._judged("circuit")
        self.assertEqual(b["judge"], "Circuit judge")
        self.assertTrue(api.MODEL.llm.calls[-1]["system_prompt"].startswith(room.CIRCUIT_JUDGE["prompt"]))

    def test_the_take_does_not_flag_speed_for_a_fast_judge(self):
        self.assertIn("fastOk: fastJudge(r)", SRC["plugin.js"])
        self.assertIn("(s.wpm > 175 && !fastOk) || s.wpm < 115", SRC["floor.js"])


class OnTopicHeadlines(unittest.TestCase):
    def test_a_headline_must_name_the_topic(self):
        w = headlines.topic_words("the Federal Reserve")
        al = headlines.aliases_for("the Federal Reserve")
        for t in ("Fed policymakers consider rate hike", "Fed's Williams: inflation too high", "Federal Reserve keeps rates unchanged", "FOMC minutes out"):
            self.assertTrue(headlines.matches(t, w, al), t)
        for t in ("U.S. birth rate drops to record low", "Judge halts construction of the arch", "New limits on federal student loans",
                  "The Conservation Reserve program changes", "Who Will Run Anthropic, Anyway?"):
            self.assertFalse(headlines.matches(t, w, al), t)
        self.assertTrue(headlines.matches("Senate weighs tariff repeal", headlines.topic_words("tariffs")))
        self.assertTrue(headlines.matches("U.N. vote fails", headlines.topic_words("United Nations"), headlines.aliases_for("United Nations")))
        self.assertEqual(headlines.topic_words("AI in schools"), ["ai", "schools"])
        self.assertTrue(headlines.matches("Iranian talks resume", headlines.topic_words("Iran")))

    def test_the_nov_7_pull_keeps_only_the_topic(self):
        raw = json.loads((ROOT / "harness" / "pull-fed-2026-11-07.json").read_text(encoding="utf-8"))
        before = [i["title"] for c in raw["columns"] for i in c["items"]]
        self.assertIn("Judge halts construction of Trump's arch. And, Labor Department to release jobs report", before)
        kept = [i["title"] for c in headlines.on_topic(raw)["columns"] for i in c["items"]]
        for off in ("U.S. birth rate drops to record low, but older women are having more babies", "JD Vance’s economic vision is a disaster for the GOP",
                    "Trump’s Dubious Claim About the Ilhan Omar Search", "Who Will Run Anthropic, Anyway?"):
            self.assertIn(off, before)
            self.assertNotIn(off, kept)
        self.assertTrue(all(re.search(r"\bfed\b|federal reserve|open market committee", t.lower()) for t in kept), kept)
        self.assertGreaterEqual(len(kept), 15)

    def test_an_old_cached_pull_is_filtered_too(self):
        reset()
        store.update("headlines.json", lambda h: (h["topics"].__setitem__("tariffs", {"topic": "tariffs", "at": 1, "columns": [
            {"id": "x", "ok": True, "items": [{"title": "Tariff vote slips"}, {"title": "Baseball tonight"}]}]}), h)[1])
        self.assertEqual([i["title"] for i in headlines.cached("tariffs")["columns"][0]["items"]], ["Tariff vote slips"])


class Layout(unittest.TestCase):
    def test_choices_show_what_is_picked(self):
        for name, src in SRC.items():
            self.assertNotIn("SegmentedControl", src, name)
        self.assertIn("role: 'radiogroup'", SRC["core.js"])
        self.assertIn("'aria-checked': value === o.id", SRC["core.js"])
        css = SRC["styles.js"]
        self.assertIn(".ldw-choice[aria-checked=true]{border-color:var(--hk-accent)", css)
        self.assertIn(".ldw-choice[aria-checked=true] .ldw-choice-check{visibility:visible", css)

    def test_narrow_windows_keep_the_strip_on_one_row_and_speak_beside_the_clock(self):
        css = SRC["styles.js"]
        narrow = re.findall(r"@container \(max-width:900px\)\{(.*?)\}\n", css, re.S)
        self.assertFalse(any(".ldw-strip{flex-wrap:wrap}" in block for block in narrow))
        self.assertIn("@container (max-width:620px){.ldw-strip{flex-wrap:wrap}", css)
        self.assertIn(".ldw-stage2{grid-template-columns:minmax(0,1fr) 230px", css)


class HarnessFixtures(unittest.TestCase):
    def setUp(self):
        text = (ROOT / "harness" / "fixtures02.js").read_text(encoding="utf-8")
        self.fx = {m.group(1): json.loads(m.group(2)) for m in re.finditer(r"^export const (\w+) = (.*)$", text, re.M)}

    def test_the_pull_is_real_and_on_topic(self):
        pull = self.fx["PULL"]
        self.assertEqual(pull["topic"], "the Federal Reserve")
        titles = [i["title"] for c in pull["columns"] for i in c["items"]]
        self.assertTrue(titles)
        w, al = headlines.topic_words(pull["topic"]), headlines.aliases_for(pull["topic"])
        self.assertTrue(all(headlines.matches(t, w, al) for t in titles))
        for q in self.fx["DRAW"]["questions"]:
            self.assertIn(q["based_on"], titles)

    def test_the_fallacy_answer_quotes_the_opponents_real_nr(self):
        js = (ROOT / "harness" / "fixtures.js").read_text(encoding="utf-8")
        state, _ = json.JSONDecoder().raw_decode(js, re.search(r"export const STATE = ", js).end())
        nr = next(t["text"] for t in state["round"]["transcript"] if t["id"] == "NR")
        text, quotes = engine.check_quotes(nr, self.fx["SPOT_NR"])
        self.assertEqual(len(quotes), 3)
        self.assertTrue(all(q["found"] for q in quotes))
        self.assertNotIn(engine.NOT_FOUND, self.fx["SPOT_NR"])
        self.assertEqual(self.fx["SPOT_NR_MISS"].count(engine.NOT_FOUND), 1)

    def test_the_harness_opens_on_the_film_question_and_knows_the_circuit_judge(self):
        home = self.fx["HOME"]
        self.assertEqual(home["pool"][home["pool_start"]]["text"], FED)
        self.assertIn("circuit", self.fx["JUDGES"])
        seeded = [b for b in self.fx["BALLOTS"]["history"] if "pace-fast" in (b.get("measured_tags") or [])]
        self.assertTrue(seeded)
        self.assertTrue(all(b["judge_key"] not in ballots.FAST_OK_JUDGES for b in seeded))


if __name__ == "__main__":
    unittest.main()
