"""Spoken practice: what the recording measures, where takes are kept, and the transcript job.

The page records with MediaRecorder and samples the level 10 times a second. Timing, pauses and the
waveform come from those levels, so they always work, with or without a transcript.

The transcript is made on the Hermes backend with faster-whisper when Hermes's local speech-to-text
is installed (it lazy-installs faster-whisper; this plugin declares no dependency). When it is not
installed, the take keeps its timing, pauses and playback, and "Transcribe now" works later.

Takes live in the plugin's data folder: ``practice.json`` (the record of each take) and
``recordings/<id>.webm``. The last 20 recordings are kept, and never more than 100 MB.
"""

from __future__ import annotations

import base64
import importlib.util
import logging
import os
import re
import secrets
import shutil
import threading
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

try:
    from . import store
except ImportError:  # loose module (tests)
    import store  # type: ignore

_log = logging.getLogger("hermes.plugins.ld-workbench")

LEVEL_HZ = 10
PAUSE_SECONDS = 2.0
UPLOAD_CAP = 30 * 1024 * 1024
KEEP_RECORDINGS = 20
KEEP_BYTES = 100 * 1024 * 1024
KEEP_TAKES = 200
MAX_TAKE_SECONDS = 20 * 60
AUDIO_TYPES = ("audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/mpeg")
DEFAULT_MODEL = "base.en"
MODELS = ("base.en", "small.en")
MODEL_MB = {"base.en": 145, "small.en": 485}  # model.bin in Systran/faster-whisper-<name>, downloaded once
IDLE_UNLOAD = 300
EVENTS = ("ld", "extemp", "drill", "rhetoric", "opening")

# Words the transcript can catch. "Like" and "so" count only where they are not part of the sentence
# (a crude but honest rule: alone between pauses or commas, or at the start of a clause).
FILLER_WORDS = ("um", "uh", "erm", "er", "ah", "hmm", "mm")
FILLER_PHRASES = ("you know", "i mean", "kind of", "sort of")
WHISPER_PROMPT = "Um, uh, like, you know, so. I mean, um."


# ---------- measuring a take ----------
def _clean_levels(levels):
    out = []
    for v in levels if isinstance(levels, list) else []:
        out.append(_num(v, 0.0, 1.0))
    return out[: MAX_TAKE_SECONDS * LEVEL_HZ]


def silence_floor(levels):
    """The level below which a sample counts as silence: a share of the loud end of this take, so a
    quiet mic and a loud one are judged the same way."""
    if not levels:
        return 0.02
    loud = sorted(levels)[int(len(levels) * 0.9)]
    return max(0.015, loud * 0.18)


def voiced_span(levels):
    """(first, last) sample index with sound, or None for a silent take."""
    floor = silence_floor(levels)
    voiced = [i for i, v in enumerate(levels) if v > floor]
    return (voiced[0], voiced[-1]) if voiced else None


def pauses_from_levels(levels, min_seconds=PAUSE_SECONDS):
    """Silences of at least ``min_seconds`` between the first and last sound: [{at, length}] in seconds."""
    span = voiced_span(levels)
    if not span:
        return []
    floor = silence_floor(levels)
    out, start = [], None
    for i in range(span[0], span[1] + 1):
        quiet = levels[i] <= floor
        if quiet and start is None:
            start = i
        elif not quiet and start is not None:
            if (i - start) / LEVEL_HZ >= min_seconds:
                out.append({"at": round(start / LEVEL_HZ, 1), "length": round((i - start) / LEVEL_HZ, 1)})
            start = None
    return out


def pauses_from_words(words, min_seconds=PAUSE_SECONDS):
    out = []
    for a, b in zip(words, words[1:]):
        gap = b["start"] - a["end"]
        if gap >= min_seconds:
            out.append({"at": round(a["end"], 1), "length": round(gap, 1)})
    return out


def _tokens(text):
    return re.findall(r"[a-z']+|[,.;:!?]", (text or "").lower())


def count_fillers(text):
    """Fillers the transcript caught: um, uh and friends, two-word fillers, and "like" or "so" when
    they stand alone between punctuation or open a clause."""
    toks = _tokens(text)
    n = 0
    for i, t in enumerate(toks):
        prev = toks[i - 1] if i else "."
        nxt = toks[i + 1] if i + 1 < len(toks) else "."
        if t in FILLER_WORDS:
            n += 1
        elif t == "like" and prev in ",.;:!?" and nxt in ",":
            n += 1
        elif t == "so" and prev in ".;:!?" and nxt == ",":
            n += 1
        elif i + 1 < len(toks) and f"{t} {nxt}" in FILLER_PHRASES and prev in ",.;:!?":
            n += 1
    return n


def word_count(text):
    return len([t for t in _tokens(text) if t not in ",.;:!?" and t not in FILLER_WORDS])


STOP = set("a an the and or but of to in on at for by with is are was were be been it this that these those "
           "i we you they he she my our your their its as so if then than not no yes do does did will would can "
           "could should may might must have has had from about into over under more most".split())
ANSWER_CUES = ("my answer", "the answer is", "i answer", "i believe", "i would say", "in short", "the short answer",
               "so the answer", "my position", "yes,", "no,", "i say")


def _content(text):
    return [w for w in re.findall(r"[a-z']+", (text or "").lower()) if w not in STOP and len(w) > 2]


def answer_time(words, answer=None):
    """When the answer arrives, in seconds from the start of the take.

    With the student's own outline answer: the first point where most of its content words have
    been said inside a 14-word window. Without one: the first answer cue ("my answer", "I believe").
    None when neither shows up, or when there are no word times."""
    if not words:
        return None
    lw = [re.sub(r"[^a-z']", "", w["word"].lower()) for w in words]
    target = set(_content(answer))
    if target:
        need = max(1, round(len(target) * 0.6))
        for j in range(len(lw)):
            lo = max(0, j - 13)
            hits = [k for k in range(lo, j + 1) if lw[k] in target]
            if len({lw[k] for k in hits}) >= need:
                return round(words[hits[0]]["start"], 1)
    joined = " ".join(w["word"].lower().strip() for w in words)
    best = None
    for cue in ANSWER_CUES:
        pos = joined.find(cue)
        if pos >= 0 and (best is None or pos < best):
            best = pos
    if best is None:
        return None
    k = len(joined[:best].split())
    return round(words[min(k, len(words) - 1)]["start"], 1)


def measure(take, transcript=None, answer=None):
    """Everything the floor shows about a take. Numbers only; nothing from a model.

    ``take``: {duration, levels}. ``transcript``: {text, words: [{word, start, end}]} or None.
    Speaking time runs from the first sound to the last. Words a minute is over that time."""
    levels = _clean_levels(take.get("levels"))
    duration = _num(take.get("duration"), 0.0, MAX_TAKE_SECONDS)
    span = voiced_span(levels)
    speaking = (span[1] - span[0] + 1) / LEVEL_HZ if span else 0.0
    if not levels:
        speaking = duration
    out = {"duration": round(duration, 1), "speaking": round(min(speaking, duration or speaking), 1),
           "starts_at": round(span[0] / LEVEL_HZ, 1) if span else 0.0,
           "pauses": pauses_from_levels(levels), "measured_from": "levels" if levels else "clock"}
    words = (transcript or {}).get("words") or []
    text = (transcript or {}).get("text") or ""
    if not levels and words:
        out["pauses"] = pauses_from_words(words)
        out["measured_from"] = "words"
    if text:
        wc = word_count(text)
        out["words"] = wc
        out["wpm"] = round(wc / (out["speaking"] / 60)) if out["speaking"] >= 5 else None
        out["fillers"] = count_fillers(text)
        out["answer_at"] = answer_time(words, answer)
        if out["answer_at"] is not None:
            out["answer_at"] = max(0.0, round(out["answer_at"] - out["starts_at"], 1))
    return out


def typed_estimate(text, wpm=140):
    """For typed mode: the time the words would take aloud at ``wpm``, clearly an estimate."""
    wc = word_count(text)
    return {"words": wc, "estimated_seconds": round(wc / wpm * 60, 1), "estimated": True, "wpm_assumed": wpm}


# ---------- takes on disk ----------
def _rec_dir():
    d = store.data_dir() / "recordings"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _ext(mime):
    m = (mime or "").split(";")[0].strip().lower()
    return {"audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/mpeg": ".mp3"}.get(m, ".webm")


def check_mime(mime):
    m = (mime or "").split(";")[0].strip().lower()
    if m not in AUDIO_TYPES:
        raise ValueError("That is not an audio recording.")
    return m


def audio_path(take):
    name = take.get("file")
    if not name or "/" in name or "\\" in name or name.startswith("."):
        return None
    p = _rec_dir() / name
    return p if p.exists() else None


def _num(v, lo, hi):
    """A finite number in [lo, hi]; anything else (text, NaN, infinity) is lo. A NaN kept in practice.json
    would make every later answer that carries it unreadable as JSON."""
    try:
        f = float(v or 0)
    except (TypeError, ValueError, OverflowError):
        return lo
    if f != f or f in (float("inf"), float("-inf")):
        return lo
    return min(max(f, lo), hi)


def new_take(meta):
    """Record a take's facts before its audio arrives. Returns the take."""
    event = meta.get("event")
    if event not in EVENTS:
        raise ValueError("Unknown event.")
    take = {
        "id": secrets.token_hex(6), "event": event, "segment": str(meta.get("segment") or "")[:20],
        "limit": int(_num(meta.get("limit"), 0, MAX_TAKE_SECONDS)),
        "prompt": str(meta.get("prompt") or "")[:600], "answer": str(meta.get("answer") or "")[:300],
        "ref": str(meta.get("ref") or "")[:60], "at": int(time.time()),
        "duration": round(_num(meta.get("duration"), 0, MAX_TAKE_SECONDS), 1),
        "levels": [round(v, 3) for v in _clean_levels(meta.get("levels"))],
        "typed": bool(meta.get("typed")), "file": None, "bytes": 0, "mime": None,
        "transcript": {"status": "none", "text": "", "words": [], "model": None, "error": None},
    }
    if take["typed"]:
        text = str(meta.get("text") or "")[:20000]
        take["transcript"] = {"status": "typed", "text": text, "words": [], "model": None, "error": None}
    take["stats"] = measure(take, take["transcript"] if take["typed"] else None, take["answer"])
    if take["typed"]:
        take["stats"].update(typed_estimate(take["transcript"]["text"]))

    def add(p):
        p["takes"].append(take)
        del p["takes"][:-KEEP_TAKES]
        return p
    store.update("practice.json", add)
    return take


def get_take(take_id):
    for t in store.read("practice.json")["takes"]:
        if t["id"] == take_id:
            return t
    raise ValueError("That take is gone. Record it again.")


def change_take(take_id, fn):
    holder = {}

    def edit(p):
        for t in p["takes"]:
            if t["id"] == take_id:
                fn(t)
                holder["t"] = t
                return p
        raise ValueError("That take is gone. Record it again.")
    store.update("practice.json", edit)
    return holder["t"]


def public(take, with_levels=True):
    """A take as the page sees it (no file names)."""
    out = {k: v for k, v in take.items() if k not in ("file", "levels")}
    out["has_audio"] = bool(take.get("file"))
    if with_levels:
        out["levels"] = take.get("levels") or []
    return out


def save_audio(take_id, data, mime):
    """Keep the recording for a take. ``data`` is bytes. Old recordings past the cap are deleted."""
    mime = check_mime(mime)
    if not data:
        raise ValueError("The recording is empty. Try again.")
    if len(data) > UPLOAD_CAP:
        raise ValueError("That recording is over 30 MB. Keep takes under 20 minutes.")
    take = get_take(take_id)
    name = f"{take['id']}{_ext(mime)}"
    path = _rec_dir() / name
    tmp = path.with_suffix(path.suffix + ".part")
    try:
        with open(tmp, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        try:
            tmp.unlink()
        except OSError:
            pass

    def put(t):
        t["file"], t["bytes"], t["mime"] = name, len(data), mime
        t["transcript"]["status"] = "waiting"
    take = change_take(take_id, put)
    prune()
    return take


def save_audio_b64(take_id, b64, mime):
    if not isinstance(b64, str) or len(b64) > UPLOAD_CAP * 4 // 3 + 8:
        raise ValueError("That recording is over 30 MB. Keep takes under 20 minutes.")
    try:
        data = base64.b64decode(b64, validate=True)
    except ValueError:
        raise ValueError("The recording did not arrive whole. Try again.")
    return save_audio(take_id, data, mime)


def prune():
    """Keep the newest recordings: at most 20, and at most 100 MB in all. Takes keep their numbers."""
    takes = store.read("practice.json")["takes"]
    with_audio = [t for t in takes if t.get("file")]
    with_audio.sort(key=lambda t: t["at"], reverse=True)
    keep, total = set(), 0
    for t in with_audio:
        if len(keep) < KEEP_RECORDINGS and total + t.get("bytes", 0) <= KEEP_BYTES:
            keep.add(t["id"])
            total += t.get("bytes", 0)
    drop = [t for t in with_audio if t["id"] not in keep]
    for t in drop:
        p = audio_path(t)
        if p:
            try:
                p.unlink()
            except OSError:
                pass
    if drop:
        ids = {t["id"] for t in drop}

        def clear(p):
            for t in p["takes"]:
                if t["id"] in ids:
                    t["file"], t["bytes"] = None, 0
            return p
        store.update("practice.json", clear)
    return len(drop)


def delete_all_recordings():
    n = 0
    d = _rec_dir()
    for p in d.iterdir():
        if p.is_file():
            try:
                p.unlink()
                n += 1
            except OSError:
                pass

    def clear(p):
        for t in p["takes"]:
            t["file"], t["bytes"] = None, 0
        return p
    store.update("practice.json", clear)
    return n


def recordings_summary():
    takes = store.read("practice.json")["takes"]
    with_audio = [t for t in takes if t.get("file")]
    return {"count": len(with_audio), "bytes": sum(t.get("bytes", 0) for t in with_audio), "keep": KEEP_RECORDINGS}


# ---------- transcription ----------
def _hf_hub_dirs():
    """Where huggingface_hub keeps downloaded models, in the order it looks."""
    out = []
    if os.environ.get("HF_HUB_CACHE"):
        out.append(Path(os.environ["HF_HUB_CACHE"]))
    if os.environ.get("HF_HOME"):
        out.append(Path(os.environ["HF_HOME"]) / "hub")
    xdg = os.environ.get("XDG_CACHE_HOME")
    out.append(Path(xdg) / "huggingface" / "hub" if xdg else Path.home() / ".cache" / "huggingface" / "hub")
    return out


def model_cached(name):
    """True when the speech model is already on this computer, so the first transcript needs no download."""
    if name not in MODELS:
        return False
    for hub in _hf_hub_dirs():
        snaps = hub / f"models--Systran--faster-whisper-{name}" / "snapshots"
        try:
            if any((d / "model.bin").exists() for d in snaps.iterdir()):
                return True
        except OSError:
            continue
    return False


def transcript_status(chosen=None):
    chosen = chosen if chosen in MODELS else DEFAULT_MODEL
    return {"available": TRANSCRIBER.available(), "model": chosen, "models": list(MODELS),
            "cached": {m: model_cached(m) for m in MODELS}, "mb": dict(MODEL_MB)}


def whisper_installed():
    try:
        return importlib.util.find_spec("faster_whisper") is not None
    except (ImportError, ValueError):
        return False


class NeedsDownload(Exception):
    """The speech model is not on this computer and the student has not asked for it yet."""

    def __init__(self, name):
        super().__init__(name)
        self.name = name


def download_ask(name):
    mb = MODEL_MB.get(name, 150)
    return (f"Transcripts need the {name} speech model (about {mb} MB), which is not on this computer yet. "
            "Press Transcribe now to download it once from huggingface.co (no audio is sent), or type what you said.")


class Transcriber:
    """faster-whisper behind one worker thread, loaded on first use and unloaded after 5 idle minutes.

    ``engine`` can be replaced (tests): a callable (path, model_name) -> {text, words}."""

    def __init__(self, engine=None):
        self._engine = engine
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ldw-transcribe")
        self._model = None
        self._model_name = None
        self._lock = threading.Lock()
        self._last_used = 0.0
        self._cancel = set()
        self._jobs = set()  # takes queued or running in this process
        self._timer = None

    def available(self):
        return bool(self._engine) or whisper_installed()

    def _load(self, name, allow_download=False):
        if self._model is not None and self._model_name == name:
            return self._model
        os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
        from faster_whisper import WhisperModel
        try:
            self._model = WhisperModel(name, device="cpu", compute_type="int8", local_files_only=True)
        except Exception:
            if not allow_download:  # the download happens only after the student presses Transcribe now
                raise NeedsDownload(name)
            self._model = WhisperModel(name, device="cpu", compute_type="int8", local_files_only=False)
        self._model_name = name
        return self._model

    def _whisper(self, path, name, allow_download=False):
        model = self._load(name, allow_download)
        segments, _info = model.transcribe(str(path), word_timestamps=True, initial_prompt=WHISPER_PROMPT,
                                           vad_filter=False, condition_on_previous_text=False, beam_size=5, language="en")
        words, parts = [], []
        for seg in segments:
            parts.append(seg.text)
            for w in seg.words or []:
                words.append({"word": w.word.strip(), "start": round(float(w.start), 2), "end": round(float(w.end), 2)})
        return {"text": " ".join(p.strip() for p in parts).strip(), "words": words}

    def _unload_later(self):
        def check():
            with self._lock:
                if self._model is not None and time.time() - self._last_used >= IDLE_UNLOAD:
                    self._model = None
                    self._model_name = None
        if self._timer:
            self._timer.cancel()
        self._timer = threading.Timer(IDLE_UNLOAD + 1, check)
        self._timer.daemon = True
        self._timer.start()

    def cancel(self, take_id):
        self._cancel.add(take_id)

    def busy(self, take_id):
        return take_id in self._jobs

    def _mark_cancelled(self, take_id):
        """Cancelled, unless the student has since typed their own words (those stay)."""
        def put(t):
            if t["transcript"].get("status") in ("waiting", "working"):
                t["transcript"]["status"] = "cancelled"
        change_take(take_id, put)

    def start(self, take_id, model_name=DEFAULT_MODEL, allow_download=False):
        """Queue a take. Its status moves waiting -> working -> done | failed | unavailable.

        ``allow_download``: True only when the student pressed Transcribe now. A recording that has just
        arrived never starts a download of the speech model; its take says what the download is and waits."""
        if model_name not in MODELS:
            model_name = DEFAULT_MODEL
        take = get_take(take_id)
        if not take.get("file"):
            raise ValueError("This take has no recording to transcribe.")
        if not self.available():
            change_take(take_id, lambda t: t["transcript"].update(status="unavailable", error=None))
            return get_take(take_id)
        self._cancel.discard(take_id)
        if take_id in self._jobs:  # a second press while it is already queued or running
            return get_take(take_id)
        if self._engine is None and not allow_download and not model_cached(model_name):
            change_take(take_id, lambda t: t["transcript"].update(status="failed", error=download_ask(model_name)))
            return get_take(take_id)
        self._jobs.add(take_id)
        change_take(take_id, lambda t: t["transcript"].update(status="waiting", error=None))
        try:
            self._pool.submit(self._run, take_id, model_name, allow_download)
        except RuntimeError:  # the pool is shutting down with Hermes
            self._jobs.discard(take_id)
            change_take(take_id, lambda t: t["transcript"].update(status="failed", error=INTERRUPTED))
        return get_take(take_id)

    def _run(self, take_id, model_name, allow_download=False):
        try:
            if take_id in self._cancel:
                self._mark_cancelled(take_id)
                return
            take = get_take(take_id)
            path = audio_path(take)
            if not path:
                raise RuntimeError("The recording is gone.")
            def begin(t):  # only a waiting take starts; typed words that arrived first stay as they are
                if t["transcript"].get("status") == "waiting":
                    t["transcript"].update(status="working", started=int(time.time()))
            if change_take(take_id, begin)["transcript"].get("status") != "working":
                return
            with self._lock:
                result = self._engine(path, model_name) if self._engine else self._whisper(path, model_name, allow_download)
                self._last_used = time.time()
            if take_id in self._cancel:
                self._mark_cancelled(take_id)
                return
            text = str(result.get("text") or "").strip()[:40000]
            words = [w for w in (result.get("words") or []) if isinstance(w, dict)][:12000]

            def done(t):
                if t["transcript"].get("status") not in ("waiting", "working"):
                    return  # the student typed their own words meanwhile; theirs win
                t["transcript"] = {"status": "done", "text": text, "words": words, "model": model_name, "error": None}
                t["stats"] = measure(t, t["transcript"], t.get("answer"))
            change_take(take_id, done)
        except Exception as e:  # never leaves a take stuck in "working"
            (_log.info if isinstance(e, NeedsDownload) else _log.warning)("ld-workbench: transcription of %s failed: %r", take_id, e)
            msg = "The transcript could not be made. Your timing and pauses are kept."
            if isinstance(e, NeedsDownload):
                msg = download_ask(e.name)
            elif "download" in str(e).lower() or "huggingface" in str(e).lower() or "connect" in str(e).lower():
                msg = "The speech model could not be downloaded. Check the internet connection, then press Transcribe now."
            try:
                def failed(t):
                    if t["transcript"].get("status") in ("waiting", "working"):
                        t["transcript"].update(status="failed", error=msg)
                change_take(take_id, failed)
            except ValueError:
                pass
        finally:
            self._jobs.discard(take_id)
            self._unload_later()


TRANSCRIBER = Transcriber()
INTERRUPTED = "The transcript was interrupted (Hermes may have restarted). Press Transcribe now."


def settle(take):
    """A take whose transcript says waiting or working but has no job in this process (Hermes restarted
    mid-job) is marked failed, so the page stops waiting and offers Transcribe now. Returns the take."""
    if take["transcript"].get("status") in ("waiting", "working") and not TRANSCRIBER.busy(take["id"]):
        def put(t):
            if t["transcript"].get("status") in ("waiting", "working") and not TRANSCRIBER.busy(t["id"]):
                t["transcript"].update(status="failed", error=INTERRUPTED)
        try:
            return change_take(take["id"], put)
        except ValueError:
            return take
    return take


def set_text(take_id, text):
    """The student's own words for a take: typed when there is no transcript, or a corrected transcript.
    Timing, pauses and speaking time still come from the recording; words a minute uses these words."""
    text = str(text or "").strip()
    if not text:
        raise ValueError("Type what you said first.")
    if len(text) > 20000:
        raise ValueError("That is longer than a 20-minute speech.")

    def put(t):
        tr = t["transcript"]
        words = tr.get("words") if tr.get("status") == "done" and tr.get("text") == text else []
        t["transcript"] = {"status": "typed" if not words else "done", "text": text, "words": words,
                           "model": tr.get("model"), "error": None, "edited": True}
        t["stats"] = measure(t, t["transcript"], t.get("answer"))
    return change_take(take_id, put)


# ---------- hearing the opponent: the user's own Hermes voice output ----------
VOICE_OFF = ("Hermes has no voice output set up. In Hermes Settings, Voice, choose a text-to-speech provider. "
             "You can still read the speech.")
VOICE_KEEP = 8
VOICE_MAX_BYTES = 20 * 1024 * 1024
VOICE_MIMES = {".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".opus": "audio/ogg", ".wav": "audio/wav",
               ".m4a": "audio/mp4", ".aac": "audio/mp4", ".flac": "audio/flac", ".webm": "audio/webm"}


def _voice_dir():
    d = store.data_dir() / "voice"
    d.mkdir(parents=True, exist_ok=True)
    return d


def voice_key(text):
    import hashlib
    return hashlib.sha256(" ".join(str(text or "").split()).encode("utf-8")).hexdigest()[:16]


def _voice_cached(key):
    for p in _voice_dir().glob(f"{key}.*"):
        if p.suffix in VOICE_MIMES and p.is_file() and 0 < p.stat().st_size <= VOICE_MAX_BYTES:
            return p
    return None


def parse_tts(raw):
    """The audio file Hermes's text_to_speech tool wrote, from its JSON envelope; a plain message otherwise."""
    import json as _json
    data = raw
    if isinstance(raw, (bytes, str)):
        try:
            data = _json.loads(raw)
        except ValueError:
            raise ValueError("The voice answered with something unreadable. Try again, or read the speech.")
    if not isinstance(data, dict):
        raise ValueError("The voice answered with something unreadable. Try again, or read the speech.")
    if not data.get("success") or data.get("error"):
        err = str(data.get("error") or "").lower()
        if "unknown tool" in err or "not configured" in err or "api key" in err or "no tts" in err or "not available" in err:
            raise ValueError(VOICE_OFF)
        raise ValueError("The voice could not read this speech. Try again, or read the speech.")
    paths = data.get("file_paths") or ([data.get("file_path")] if data.get("file_path") else [])
    out = [Path(p) for p in paths if isinstance(p, str) and Path(p).suffix.lower() in VOICE_MIMES and Path(p).is_file()]
    if not out:
        raise ValueError("The voice made no audio. Try again, or read the speech.")
    return out


def opponent_audio(text, synth):
    """The opponent's speech as audio: cached by its words, made once with ``synth(text, out_path) -> raw``.

    Returns {"parts": [{"b64", "mime"}], "cached": bool}. Several parts when the provider split a long speech."""
    import base64 as _b64
    words = " ".join(str(text or "").split())
    if len(words) < 20:
        raise ValueError("There is no speech to read yet.")
    key = voice_key(words)
    hit = _voice_cached(key)
    files, cached = ([hit], True) if hit else (None, False)
    if not files:
        files = parse_tts(synth(words, str(_voice_dir() / f"{key}.mp3")))
        keep = []
        for i, f in enumerate(files):  # under our own name, in our own folder, so the cache and cleanup find them
            dest = _voice_dir() / (f"{key}{f.suffix.lower()}" if i == 0 else f"{key}-{i}{f.suffix.lower()}")
            if f.resolve() != dest.resolve():
                if f.stat().st_size > VOICE_MAX_BYTES:
                    raise ValueError("The audio for this speech is too large to play here. Read the speech instead.")
                try:
                    shutil.copyfile(f, dest)  # a copy: the tool's own file is the tool's to keep or clean up
                except OSError:
                    raise ValueError("The voice made audio this plugin could not keep. Try again, or read the speech.")
            keep.append(dest)
        files = keep
        olds = sorted((p for p in _voice_dir().iterdir() if p.is_file()), key=lambda p: p.stat().st_mtime, reverse=True)
        stems = []
        for p in olds:
            stem = p.stem.split("-")[0]
            if stem not in stems:
                stems.append(stem)
            if stems.index(stem) >= VOICE_KEEP:
                try:
                    p.unlink()
                except OSError:
                    pass
    parts, total = [], 0
    for f in files:
        total += f.stat().st_size
        if total > VOICE_MAX_BYTES:
            raise ValueError("The audio for this speech is too large to play here. Read the speech instead.")
        b = f.read_bytes()
        parts.append({"b64": _b64.b64encode(b).decode("ascii"), "mime": VOICE_MIMES[f.suffix.lower()]})
    return {"parts": parts, "cached": cached}
