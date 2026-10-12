/**
 * FG-04B2: research-only inspection of MIDI fingering text events.
 * Independent implementation; no Hand-thesia code or binary dependencies.
 * This module never rewrites MIDI, MusicXML, user corrections, or player state.
 */
const MAX_BYTES = 4_000_000;
const MAX_NOTES = 25_000;
const MAX_TRACKS = 64;
const MAX_TICKS = 100_000_000;
const decoder = new TextDecoder('ascii');
const assert = (ok, why) => { if (!ok) throw Error(why); };
const fingerTag = /^(?:[RL][1-5]|F[1-5]|[RL])$/;

export function inspectFingeredMidi(raw) {
  const b = raw instanceof Uint8Array ? raw : raw instanceof ArrayBuffer ? new Uint8Array(raw) : null;
  assert(b && b.length >= 22 && b.length <= MAX_BYTES, 'INVALID_MIDI_SIZE');
  const tag = i => decoder.decode(b.subarray(i, i + 4));
  const u16 = i => (b[i] << 8) | b[i + 1];
  const u32 = i => (b[i] * 0x1000000 + (b[i+1] << 16) + (b[i+2] << 8) + b[i+3]);
  assert(tag(0) === 'MThd' && u32(4) === 6, 'INVALID_MIDI_HEADER');
  const format = u16(8), trackCount = u16(10), division = u16(12);
  assert((format === 0 || format === 1) && (format !== 0 || trackCount === 1) &&
    trackCount > 0 && trackCount <= MAX_TRACKS && division > 0 && !(division & 0x8000),
    'UNSUPPORTED_MIDI_FORMAT_OR_DIVISION');
  let pos = 14, serial = 0;
  const tempos = [], notes = [];
  for (let track = 0; track < trackCount; track++) {
    assert(pos + 8 <= b.length && tag(pos) === 'MTrk', 'MISSING_MIDI_TRACK');
    const size = u32(pos + 4);
    pos += 8;
    const stop = pos + size;
    assert(size > 0 && stop <= b.length, 'INVALID_TRACK_LENGTH');
    let tick = 0, status = 0, ended = false, pending = null;
    const held = new Map();
    const vlq = () => {
      let v = 0;
      for (let k = 0; k < 4; k++) {
        assert(pos < stop, 'TRUNCATED_MIDI_EVENT');
        const x = b[pos++];
        v = (v << 7) | (x & 127);
        if (!(x & 128)) return v;
      }
      throw Error('INVALID_MIDI_VLQ');
    };
    while (pos < stop) {
      tick += vlq();
      assert(tick <= MAX_TICKS && pos < stop, 'MIDI_TIMELINE_OUT_OF_RANGE');
      const first = b[pos];
      let op;
      if (first & 128) { op = b[pos++]; if (op < 0xf0) status = op; else status = 0; }
      else { assert(status >= 0x80 && status <= 0xef, 'INVALID_RUNNING_STATUS'); op = status; }
      if (op === 0xff) {
        assert(pos < stop, 'TRUNCATED_META');
        const type = b[pos++], count = vlq();
        assert(pos + count <= stop, 'TRUNCATED_META_PAYLOAD');
        if (type === 0x51) {
          assert(count === 3, 'BAD_TEMPO_EVENT');
          const micros = (b[pos] << 16) | (b[pos+1] << 8) | b[pos+2];
          assert(micros > 0, 'BAD_TEMPO_EVENT');
          tempos.push({tick, micros});
        } else if (type === 0x01) {
          const txt = decoder.decode(b.subarray(pos, pos + count));
          if (fingerTag.test(txt)) {
            assert(pending === null, 'UNBOUND_FINGER_MARKER');
            pending = {tick, text:txt};
          }
        } else if (type === 0x2f) {
          assert(count === 0 && pos + count === stop, 'EARLY_END_OF_TRACK');
          ended = true;
        }
        pos += count;
        if (ended) break;
        continue;
      }
      assert(op >= 0x80 && op <= 0xef, 'UNSUPPORTED_MIDI_EVENT');
      const kind = op & 0xf0, channel = op & 0x0f;
      const bytes = kind === 0xc0 || kind === 0xd0 ? 1 : 2;
      assert(pos + bytes <= stop, 'TRUNCATED_CHANNEL_EVENT');
      const a = b[pos++], v = bytes === 2 ? b[pos++] : 0;
      assert(a < 128 && v < 128, 'INVALID_MIDI_DATA_BYTE');
      const key = channel + ':' + a;
      if (kind === 0x90 && v > 0) {
        assert(!held.has(key), 'OVERLAPPING_SAME_CHANNEL_NOTE');
        assert(pending === null || pending.tick === tick, 'UNBOUND_FINGER_MARKER');
        const marker = pending?.text ?? null;
        pending = null;
        held.set(key, {pitch:a, velocity:v, startTick:tick, track, channel, marker, serial:serial++});
      } else if (kind === 0x80 || (kind === 0x90 && v === 0)) {
        assert(held.has(key), 'UNPAIRED_NOTE_OFF');
        const note = held.get(key);
        assert(tick > note.startTick, 'ZERO_LENGTH_MIDI_NOTE');
        held.delete(key);
        notes.push({...note, endTick:tick});
        assert(notes.length <= MAX_NOTES, 'TOO_MANY_MIDI_NOTES');
      } else {
        assert(pending === null, 'UNBOUND_FINGER_MARKER');
      }
    }
    assert(ended && !held.size && pending === null, 'UNFINISHED_MIDI_TRACK');
    pos = stop;
  }
  assert(pos === b.length && notes.length > 0, 'TRAILING_DATA_OR_EMPTY_MIDI');
  tempos.sort((a,b) => a.tick - b.tick || a.micros - b.micros);
  const unique = [];
  for (const t of tempos) {
    const prev = unique.at(-1);
    assert(!prev || prev.tick !== t.tick || prev.micros === t.micros, 'CONFLICTING_TEMPO_EVENTS');
    if (!prev || prev.tick !== t.tick) unique.push(t);
  }
  if (!unique.length || unique[0].tick > 0) unique.unshift({tick:0, micros:500000});
  return {format, division, tempoMap:unique, notes};
}

const eventKey = n => [n.pitch,n.startTick,n.endTick,n.velocity].join(':');
const noteSeconds = (tick, midi) => {
  let prevTick = 0, seconds = 0, micros = 500000;
  for (const tempo of midi.tempoMap) {
    if (tempo.tick > tick) break;
    seconds += (tempo.tick - prevTick) * micros / (midi.division * 1000000);
    prevTick = tempo.tick;
    micros = tempo.micros;
  }
  return seconds + (tick - prevTick) * micros / (midi.division * 1000000);
};
const rejected = reason => ({status:'rejected',reason,notes:[],summary:null,
  provenance:'external-generated',productionAutoFingeringAllowed:false});

/**
 * sourceNotes must be notes from the canonical MusicXML source, NOT the
 * candidate MIDI. Ambiguous unisons/timing and changed sound reject the whole
 * report, even if some finger tags look plausible.
 */
export function compareHandthesiaMidi(referenceBytes, candidateBytes, sourceNotes) {
  let reference, candidate;
  try {
    reference = inspectFingeredMidi(referenceBytes);
    candidate = inspectFingeredMidi(candidateBytes);
  } catch (e) { return rejected(String(e.message)); }
  if (reference.division !== candidate.division ||
      JSON.stringify(reference.tempoMap) !== JSON.stringify(candidate.tempoMap))
    return rejected('MIDI_TEMPO_OR_PPQ_CHANGED');
  if (reference.notes.length !== candidate.notes.length)
    return rejected('MIDI_NOTE_COUNT_CHANGED');
  if (!Array.isArray(sourceNotes) || sourceNotes.length !== reference.notes.length)
    return rejected('SOURCE_IDENTITY_MANIFEST_REQUIRED');
  const pool = new Map();
  for (const n of candidate.notes) {
    const key = eventKey(n);
    if (pool.has(key)) return rejected('AMBIGUOUS_MIDI_UNISON');
    pool.set(key,n);
  }
  const references = new Map();
  for (const n of reference.notes) {
    const key = eventKey(n);
    if (references.has(key)) return rejected('AMBIGUOUS_SOURCE_MIDI_UNISON');
    references.set(key,n);
    if (!pool.has(key)) return rejected('MIDI_NOTE_TIMING_PITCH_OR_VELOCITY_CHANGED');
  }
  // Seconds are calculated against the immutable original tempo map. The
  // 2-ms export tolerance is NOT a license for candidate note-time changes.
  const claimedIds = new Set(), remaining = new Set(references.keys());
  const index = new Map();
  for (const [key, note] of references) {
    const bucket = note.pitch + ':' + Math.round(noteSeconds(note.startTick,reference)*1000);
    if (!index.has(bucket)) index.set(bucket,[]);
    index.get(bucket).push(key);
  }
  const result = [], summary = {total:sourceNotes.length,generated:0,preserved:0,
    conflicts:0,unknownHand:0,missing:0};
  for (const source of sourceNotes) {
    if (typeof source?.noteId !== 'string' || !source.noteId ||
        claimedIds.has(source.noteId) || !Number.isInteger(source.pitch) ||
        !Number.isFinite(source.start) || !Number.isFinite(source.duration) ||
        source.start < 0 || source.duration <= 0)
      return rejected('INVALID_OR_DUPLICATE_SOURCE_ID');
    claimedIds.add(source.noteId);
    const rounded = Math.round(source.start*1000);
    const matches = [];
    for (let ms = rounded-2; ms <= rounded+2; ms++) {
      for (const key of index.get(source.pitch + ':' + ms) ?? []) {
        if (!remaining.has(key)) continue;
        const n = references.get(key);
        if (Math.abs(noteSeconds(n.startTick,reference)-source.start) <= .002 &&
            Math.abs(noteSeconds(n.endTick,reference)-source.start-source.duration) <= .002)
          matches.push(key);
      }
    }
    if (matches.length !== 1) return rejected('AMBIGUOUS_OR_UNMATCHED_SOURCE_NOTE');
    const key = matches[0], n = pool.get(key);
    remaining.delete(key);
    const marker = n.marker;
    const finger = marker && /[1-5]$/.test(marker) ? Number(marker.at(-1)) : null;
    const hand = marker?.startsWith('R') ? 'RH' : marker?.startsWith('L') ? 'LH' : null;
    const author = source.fingeringSource === 'musicxml' &&
      Number.isInteger(source.finger) && source.finger >= 1 && source.finger <= 5
      ? source.finger : null;
    const classification = finger === null ? 'missing' :
      author !== null && author === finger ? 'preserved' :
      author !== null ? 'conflict' : 'generated';
    if (classification === 'missing') summary.missing++;
    else if (classification === 'preserved') summary.preserved++;
    else if (classification === 'conflict') summary.conflicts++;
    else summary.generated++;
    if (finger !== null && hand === null) summary.unknownHand++;
    result.push({noteId:source.noteId,pitch:source.pitch,partId:source.partId??null,
      voice:source.voice??null,staff:source.staff??null,authorFinger:author,
      candidateFinger:finger,candidateHand:hand,classification,provenance:'external-generated'});
  }
  if (remaining.size) return rejected('UNMAPPED_MIDI_NOTE');
  return {status:summary.conflicts?'conflicts':'compatible',reason:summary.conflicts?
    'EXTERNAL_CANDIDATE_CONFLICTS_WITH_AUTHOR':null,
    summary,notes:result,provenance:'external-generated',
    productionAutoFingeringAllowed:false};
}
