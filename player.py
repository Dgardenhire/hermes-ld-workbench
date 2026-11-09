"""The take player's timeline: every word of a take with its time, the sentences, the fillers and the
pauses over 2 seconds, so the page can light the word being said and jump to a line the judge quoted.

Two ways to get the times, said on the timeline as ``method``:

- ``words``: the workbench's faster-whisper gives each word its own start and end. Exact.
- ``pauses``: Hermes's own speech-to-text gives text only. Each sentence start is anchored to a silence
  in the take's 10-a-second levels (the gaps a speaker leaves between sentences), chosen so the sentences
  share the voiced time in proportion to their length. Words inside a sentence are placed by voiced time
  too, so the quiet parts are skipped. Never spread evenly over the clock. These times are estimates, and
  the page can turn quote-click off on this path (``QUOTE_CLICK_TEXT_ONLY`` in desktop/src/player.js).

``none``: no transcript, a typed take, or no levels to anchor to. The page still plays the recording.

All times are seconds from the start of the recording, the same clock as ``take.levels`` and the audio.
Numbers only; nothing here calls a model.
"""

from __future__ import annotations

import re

try:
    from . import speech
except ImportError:  # loose module (tests)
    import speech  # type: ignore

LEAD = 0.3            # a jump to a line starts this long before it
ANCHOR_GAP = 3        # a quiet run of this many level samples (0.3 s) can end a sentence
FREE_COST = 1.6       # seconds of mismatch a sentence may cost before it is left unanchored
GAP_BONUS = 0.8       # a longer silence is a likelier sentence boundary: seconds of credit per second of gap
GAP_CAP = 1.5
HZ = speech.LEVEL_HZ


# ---------- words ----------
def norm(word):
    """A word as the matcher sees it: lower case, letters, digits and apostrophes only."""
    return re.sub(r"[^a-z0-9']", "", str(word or "").lower().replace("’", "'"))


def split_words(text):
    """The transcript's words as shown, punctuation kept on the word ("prices," "now.")."""
    return re.findall(r"\S+", text or "")


def ends_sentence(word):
    return bool(re.search(r"[.!?][\"'”’)\]]*$", word or ""))


def filler_flags(display):
    """Which shown words are fillers, by the same rule ``speech.count_fillers`` counts with."""
    toks, owner = [], []
    for i, w in enumerate(display):
        for t in speech._tokens(w):
            toks.append(t)
            owner.append(i)
    flags = [False] * len(display)
    for start, n in speech.filler_hits(toks):
        for k in range(start, start + n):
            flags[owner[k]] = True
    return flags


def _sentences(display):
    """[(first, last)] word indexes of each sentence."""
    out, first = [], 0
    for i, w in enumerate(display):
        if ends_sentence(w):
            out.append((first, i))
            first = i + 1
    if first < len(display):
        out.append((first, len(display) - 1))
    return out


def _letters(w):
    return max(1, len(norm(w)))


# ---------- anchoring sentences to the levels (the text-only path) ----------
def _voiced(levels):
    span = speech.voiced_span(levels)
    if not span:
        return None, None, None
    floor = speech.silence_floor(levels)
    on = [v > floor for v in levels]
    cum = [0] * (len(levels) + 1)  # cum[i] = voiced samples in [span0, i)
    for i in range(len(levels)):
        cum[i + 1] = cum[i] + (1 if span[0] <= i <= span[1] and on[i] else 0)
    return span, on, cum


def boundaries(levels, min_samples=ANCHOR_GAP):
    """Places a sentence could start: [(index of the first sound after a quiet run, run length in samples)]."""
    span, on, _ = _voiced(levels)
    if not span:
        return []
    out, start = [], None
    for i in range(span[0], span[1] + 1):
        if not on[i] and start is None:
            start = i
        elif on[i] and start is not None:
            if i - start >= min_samples:
                out.append((i, i - start))
            start = None
    return out


def _at_voiced(cum, target, lo, hi):
    """The first sample index in [lo, hi] where the voiced count from the start reaches ``target``."""
    for i in range(lo, hi + 1):
        if cum[i + 1] >= target:
            return i
    return hi


def anchor_sentences(levels, weights):
    """Start index (in level samples) of each sentence, given each sentence's length (``weights``).

    The first sentence starts at the first sound. Each later one is snapped to a silence so that the
    voiced time before it matches its share of the words; a sentence with no silence near its share is
    placed at the share itself. Returns (starts, anchored), where anchored[k] says a silence was used."""
    span, on, cum = _voiced(levels)
    m = len(weights)
    if not span or not m:
        return [], []
    total_v = cum[span[1] + 1]
    total_w = float(sum(weights))
    targets = []
    acc = 0.0
    for w in weights[:-1]:
        acc += w
        targets.append(acc / total_w * total_v)
    cands = boundaries(levels)
    n = len(cands)
    INF = float("inf")
    # F[k][j]: least cost for sentences 1..k with every chosen silence at index <= j (j = -1: none chosen).
    # Stored with a +1 offset on j. choice[k][j]: 'u' used silence j, 'f' sentence k left free, 'c' carried from j-1.
    F = [[0.0] * (n + 1)] + [[INF] * (n + 1) for _ in range(m - 1)]
    choice = [[None] * (n + 1) for _ in range(m)]
    for k in range(1, m):
        tgt = targets[k - 1]
        row, prev = F[k], F[k - 1]
        row[0] = prev[0] + FREE_COST
        choice[k][0] = "f"
        for jj in range(1, n + 1):
            idx, gap = cands[jj - 1]
            cost = abs(cum[idx] - tgt) / HZ - GAP_BONUS * min(gap / HZ, GAP_CAP)
            best, how = row[jj - 1], "c"
            if prev[jj - 1] + cost < best:
                best, how = prev[jj - 1] + cost, "u"
            if prev[jj] + FREE_COST < best:
                best, how = prev[jj] + FREE_COST, "f"
            row[jj], choice[k][jj] = best, how
    picks = [None] * m
    k, jj = m - 1, n
    while k >= 1:
        how = choice[k][jj]
        if how == "c":
            jj -= 1
            continue
        if how == "u":
            picks[k] = cands[jj - 1][0]
            jj -= 1
        k -= 1
    starts, anchored = [span[0]], [True]
    for k in range(1, m):
        if picks[k] is not None:
            starts.append(picks[k])
            anchored.append(True)
        else:
            starts.append(_at_voiced(cum, targets[k - 1], span[0], span[1]))
            anchored.append(False)
    for k in range(1, m):  # keep the order even where a free sentence fell before its neighbour
        starts[k] = max(starts[k], starts[k - 1] + 1)
    return starts, anchored


def _place_words(levels, cum, display, first, last, s0, s1):
    """Word start times inside one sentence, by voiced time, between sample s0 (its start) and s1 (the next)."""
    weights = [_letters(display[i]) for i in range(first, last + 1)]
    total = float(sum(weights))
    v0, v1 = cum[s0], cum[max(s0, s1)]
    out, acc = [], 0.0
    for w in weights:
        target = v0 + acc / total * (v1 - v0)
        out.append(_at_voiced(cum, target, s0, max(s0, s1 - 1)) if v1 > v0 else s0)
        acc += w
    out[0] = s0
    return out


# ---------- the timeline ----------
def _pauses_after(tokens, pauses):
    """Mark each pause over 2 s after the last word that starts before its middle."""
    for p in pauses:
        mid = p["at"] + p["length"] / 2
        k = None
        for i, t in enumerate(tokens):
            if t["t"] is not None and t["t"] < mid:
                k = i
        if k is not None and k < len(tokens) - 1:
            tokens[k]["pause"] = round(p["length"], 1)


def timeline(take):
    """The take's words with times, for the player. See the module docstring for ``method``."""
    tr = take.get("transcript") or {}
    status = tr.get("status")
    text = (tr.get("text") or "").strip()
    levels = speech._clean_levels(take.get("levels"))
    stats = take.get("stats") or {}
    out = {"method": "none", "tokens": [], "sentences": [], "lead": LEAD,
           "starts_at": stats.get("starts_at") or (round(speech.voiced_span(levels)[0] / HZ, 1) if speech.voiced_span(levels) else 0.0)}
    if take.get("typed") or status not in ("done", "typed") or not text:
        return out
    words = [w for w in (tr.get("words") or []) if isinstance(w, dict) and str(w.get("word", "")).strip()]
    if status == "done" and words:
        display = [str(w["word"]).strip() for w in words]
        tokens = [{"w": d, "t": round(float(w.get("start") or 0), 2), "e": round(float(w.get("end") or w.get("start") or 0), 2)}
                  for d, w in zip(display, words)]
        out["method"] = "words"
    else:
        display = split_words(text)
        tokens = [{"w": d, "t": None, "e": None} for d in display]
    flags = filler_flags(display)
    sents = _sentences(display)
    for k, (a, b) in enumerate(sents):
        for i in range(a, b + 1):
            tokens[i]["s"] = k
            if flags[i]:
                tokens[i]["filler"] = True
    if out["method"] == "words":
        out["sentences"] = [{"t": tokens[a]["t"], "first": a, "anchored": True} for a, _ in sents]
        _pauses_after(tokens, stats.get("pauses") or (speech.pauses_from_levels(levels) if levels else speech.pauses_from_words(words)))
    elif status == "done" and levels and speech.voiced_span(levels):
        starts, anchored = anchor_sentences(levels, [sum(_letters(display[i]) for i in range(a, b + 1)) for a, b in sents])
        _, _, cum = _voiced(levels)
        span_end = speech.voiced_span(levels)[1] + 1
        for k, (a, b) in enumerate(sents):
            s1 = starts[k + 1] if k + 1 < len(starts) else span_end
            for i, at in zip(range(a, b + 1), _place_words(levels, cum, display, a, b, starts[k], s1)):
                tokens[i]["t"] = round(at / HZ, 2)
            for i in range(a, b + 1):
                tokens[i]["e"] = tokens[i + 1]["t"] if i + 1 <= b else round(s1 / HZ, 2)
        out["method"] = "pauses"
        out["sentences"] = [{"t": round(starts[k] / HZ, 2), "first": a, "anchored": anchored[k]} for k, (a, _) in enumerate(sents)]
        _pauses_after(tokens, stats.get("pauses") or speech.pauses_from_levels(levels))
    else:
        out["sentences"] = [{"t": None, "first": a, "anchored": False} for a, _ in sents]
    out["tokens"] = tokens
    return out


# ---------- finding a quoted line ----------
def _pieces(line):
    """The words of a quoted line to look for: the first piece of 3 or more words around a "..." elision."""
    parts = [[norm(w) for w in split_words(p)] for p in re.split(r"\.\.\.|…", line or "")]
    parts = [[w for w in p if w] for p in parts]
    for p in parts:
        if len(p) >= 3:
            return p
    return [w for p in parts for w in p]


def locate(tl, line):
    """Index of the token where ``line`` starts in the timeline, or None. Exact first, then a close match
    (in order, at least 80% of the words, inside a window two words longer than the line)."""
    q = _pieces(line)
    toks = tl.get("tokens") or []
    keys = [norm(t["w"]) for t in toks]
    idx = [i for i, k in enumerate(keys) if k]
    seq = [keys[i] for i in idx]
    if not q or not seq:
        return None
    n = len(q)
    for s in range(len(seq) - n + 1):
        if seq[s:s + n] == q:
            return idx[s]
    best, at = 0.0, None
    for s in range(len(seq)):
        if seq[s] != q[0] and (n < 2 or seq[s] != q[1]):
            continue
        win = seq[s:s + n + 2]
        score = _lcs(q, win) / n
        if score > best:
            best, at = score, s
    return idx[at] if at is not None and best >= 0.8 else None


def _lcs(a, b):
    prev = [0] * (len(b) + 1)
    for x in a:
        cur = [0]
        for j, y in enumerate(b):
            cur.append(prev[j] + 1 if x == y else max(prev[j + 1], cur[j]))
        prev = cur
    return prev[-1]


def jump_time(tl, line):
    """Where a click on the quoted line starts playback (seconds), or None when the line is not found
    or the timeline has no times."""
    i = locate(tl, line)
    if i is None:
        return None
    t = tl["tokens"][i]["t"]
    return None if t is None else max(0.0, round(t - tl.get("lead", LEAD), 2))


# ---------- the text-only check (Lane F, Monday: 5 takes) ----------
def text_only_report(take, lines=()):
    """For a take that has faster-whisper word times: how far the text-only path's jumps land from the
    words path's. Errors in seconds, per sentence start and per quoted line, plus one log line."""
    exact = timeline(take)
    tr = dict(take.get("transcript") or {})
    tr["words"] = []
    est = timeline({**take, "transcript": tr})
    if exact["method"] != "words" or est["method"] != "pauses":
        return {"ok": False, "reason": f"needs word times and levels (got {exact['method']} and {est['method']})"}
    errs = [round(abs(a["t"] - b["t"]), 2) for a, b in zip(exact["sentences"], est["sentences"])]
    line_errs = []
    for ln in lines:
        a, b = jump_time(exact, ln), jump_time(est, ln)
        line_errs.append(None if a is None or b is None else round(abs(a - b), 2))
    found = [e for e in line_errs if e is not None]
    worst = max(found) if found else (max(errs) if errs else 0.0)
    ok = worst <= 1.5
    log = (f"quote-click text-only check, take {take.get('id', '?')}: {len(errs)} sentences, "
           f"worst sentence {max(errs) if errs else 0:.2f} s, "
           f"lines {', '.join('not found' if e is None else f'{e:.2f} s' for e in line_errs) or 'none'}; "
           f"{'within' if ok else 'over'} 1.5 s")
    return {"ok": ok, "sentence_errors": errs, "line_errors": line_errs, "worst": worst, "log": log}


def report_saved(take_ids=None):
    """The text-only check over the takes kept in this plugin's data folder (LDW_DATA_DIR, or Hermes's
    profile folder): each take with word times, against the lines its own ballot quoted. One log line each."""
    try:
        from . import store
    except ImportError:  # loose module
        import store  # type: ignore
    takes = [t for t in store.read("practice.json").get("takes", []) if not take_ids or t["id"] in take_ids]
    lines_for = {}
    for b in store.read("ballots.json").get("history") or []:
        if b.get("take_id"):
            lines_for.setdefault(b["take_id"], []).extend(d.get("line", "") for d in b.get("decisive") or [])
    out = []
    for t in takes:
        rep = text_only_report(t, lines_for.get(t["id"], []))
        out.append(rep.get("log") or f"quote-click text-only check, take {t['id']}: skipped, {rep.get('reason')}")
    return out


if __name__ == "__main__":  # /usr/bin/python3 player.py [take id ...]   (run from the plugin folder)
    import sys
    for line in report_saved(sys.argv[1:] or None):
        print(line)
