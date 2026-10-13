#!/usr/bin/env python3
"""FG-04C2 optional LOCAL launcher for the owner's PianoMotion engine.

No PianoMotion/Hand-thesia source copied into Play Along. Requires a local,
authorized checkout plus its Python dependencies. Data stays on this computer.

Usage:
  python scripts/fg04c2-run-pianomotion.py \
      /path/to/pianomotion-studio/python-core original.mid analysis.json

Then:
  node scripts/fingering-engine-comparison.mjs comparison.json original.mid

The comparison JSON uses the analysis.json content under pianoMotionAnalysis
and independently authored, already-normalized canonical MusicXML source notes.
Never feed author/held-out reference fingers to PianoMotion when evaluating
blind accuracy; PianoMotion is an experiment, not an authority on authorship.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser(description="Run PianoMotion locally for Play Along research")
    parser.add_argument("python_core", type=Path, help="PianoMotion Studio python-core directory")
    parser.add_argument("original_midi", type=Path, help="Original, unchanged .mid MIDI source")
    parser.add_argument("output_json", type=Path, help="Private, local analysis JSON output")
    args = parser.parse_args()
    core = args.python_core.expanduser().resolve(strict=True)
    midi_path = args.original_midi.expanduser().resolve(strict=True)
    out = args.output_json.expanduser().resolve()
    if not (core / "handthesia_core" / "api.py").is_file():
        parser.error("PianoMotion Studio python-core/handthesia_core/api.py missing")
    if not (core / "handthesia_core" / "source_manifest.json").is_file():
        parser.error("PianoMotion Studio source manifest missing")
    if midi_path.suffix.lower() not in (".mid", ".midi"):
        parser.error("Expected original .mid or .midi input")
    if midi_path.stat().st_size > 4_000_000 or midi_path.stat().st_size < 22:
        parser.error("Original MIDI outside maximum 4 MB research size")
    if out == midi_path or out.is_dir():
        parser.error("Output may not overwrite the original MIDI")
    if out.exists():
        parser.error("Output file already exists; never overwrite previous results")
    sys.path.insert(0, str(core))
    try:
        from handthesia_core.api import analyze_midi
    except ImportError as exc:
        parser.error("PianoMotion local dependencies not available: " + str(exc))
    original = midi_path.read_bytes()
    digest = hashlib.sha256(original).hexdigest()
    # Empty motion sample request: calculate genuine fingering, not video poses.
    result = analyze_midi(original, {
        "fixtureId": "fg04c2-private-comparison",
        "projectId": "play-along-fg04c2",
        "revision": 0,
        "requestId": "fg04c2-local",
        "engineVersion": "from-pianomotion-source-manifest",
        "sampleTimes": [],
    })
    if result.get("status") == "invalid" or not isinstance(result.get("fingeringPlan"), dict):
        parser.error("PianoMotion returned an invalid or unplanned source")
    raw = result.get("rawBaseline", {})
    if raw.get("inputSha256") != digest:
        parser.error("Engine output does not match the original MIDI SHA-256")
    if raw.get("status") != "loaded":
        parser.error("PianoMotion repaired the source: cannot treat notes as identical")
    # Atomic creation, no replacement, owner-readable on POSIX, no raw result
    # written to stdout. This file may contain private musical material.
    payload = json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
    fd = os.open(out, flags, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(payload)
    except Exception:
        try:
            out.unlink(missing_ok=True)
        finally:
            raise
    print("PianoMotion actual fingering analysis saved locally:",
          out.name, "SHA-256:", digest, "notes:",
          len(result.get("document", {}).get("notes", [])))


if __name__ == "__main__":
    main()
