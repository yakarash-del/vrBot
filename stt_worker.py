# -*- coding: utf-8 -*-
"""Speech-to-text sidecar: loads faster-whisper once, then transcribes
audio files whose paths arrive on stdin (one per line), replying with one
JSON line per request: {"text": "..."} or {"error": "..."}.
Multilingual - auto-detects Hebrew / English / Arabic and more."""
import json
import sys

from faster_whisper import WhisperModel

model = WhisperModel("small", device="cpu", compute_type="int8")
print(json.dumps({"ready": True}), flush=True)

for line in sys.stdin:
    path = line.strip()
    if not path:
        continue
    try:
        segments, info = model.transcribe(path, vad_filter=True, beam_size=5)
        text = " ".join(seg.text.strip() for seg in segments).strip()
        print(json.dumps({"text": text, "language": info.language}), flush=True)
    except Exception as exc:  # noqa: BLE001 - report any failure to the caller
        print(json.dumps({"error": str(exc)}), flush=True)
