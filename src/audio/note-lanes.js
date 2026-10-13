const RESET_CONTROLLERS = new Set([120, 123, 124, 125, 126, 127]);

function fail(code, message, details = {}) {
  throw Object.assign(new Error(message), { name: "EngineError", code, details });
}

function rankCompare(left, right) {
  return left.time - right.time || left.sequence - right.sequence || left.inputIndex - right.inputIndex;
}

function identityKey(event) {
  return `${event.channel}:${event.pitch}:${event.noteId}`;
}

/**
 * Assign canonical file NoteOn/NoteOff identities to bounded FIFO-safe lanes.
 * Times are song seconds; `sequence` resolves equal-time parser events.
 * A lane is scoped to a logical channel/pitch, so unrelated pitches can share it.
 */
export function planNoteLanes(events, { maxLanesPerPitch = 4, exclusiveClassByNoteId = {} } = {}) {
  if (!Array.isArray(events)) throw new TypeError("events must be an array");
  if (!Number.isInteger(maxLanesPerPitch) || maxLanesPerPitch < 1 || maxLanesPerPitch > 4) {
    throw new RangeError("maxLanesPerPitch must be from 1 to 4");
  }

  const ordered = events.map((event, inputIndex) => {
    if (!event || typeof event !== "object") throw new TypeError(`event ${inputIndex} must be an object`);
    if (!Number.isFinite(event.time) || event.time < 0) throw new RangeError(`event ${inputIndex} needs a non-negative song time`);
    if (!Number.isInteger(event.channel) || event.channel < 0 || event.channel > 15) {
      throw new RangeError(`event ${inputIndex} channel must be from 0 to 15`);
    }
    const sequence = event.sequence === undefined ? inputIndex : event.sequence;
    if (!Number.isSafeInteger(sequence) || sequence < 0) throw new RangeError(`event ${inputIndex} sequence must be a non-negative integer`);
    return { ...event, inputIndex, sequence };
  }).sort(rankCompare);

  const activeByIdentity = new Map();
  const anyOnById = new Map();
  const allPairs = [];
  const channelGeneration = new Array(16).fill(0);
  const drumState = new Array(16).fill(false);
  drumState[9] = true;

  for (let rank = 0; rank < ordered.length; rank += 1) {
    const event = ordered[rank];
    if (event.type === "programChange" && event.isDrum !== undefined) drumState[event.channel] = event.isDrum;
    if (event.type === "noteOn") {
      if (typeof event.noteId !== "string" || !event.noteId) fail("NOTE_ID_DANGLING", `NoteOn at sequence ${event.sequence} needs a stable noteId`);
      if (!Number.isInteger(event.pitch) || event.pitch < 0 || event.pitch > 127) fail("NOTE_ID_MISMATCH", `NoteOn ${event.noteId} has an invalid pitch`);
      const key = identityKey(event);
      if (activeByIdentity.has(key) || anyOnById.has(event.noteId)) {
        fail("NOTE_ID_DUPLICATE", `Duplicate NoteOn identity ${event.noteId}`, { channel: event.channel, pitch: event.pitch, sequence: event.sequence });
      }
      const pair = {
        noteId: event.noteId,
        channel: event.channel,
        pitch: event.pitch,
        onRank: rank,
        onSequence: event.sequence,
        onTime: event.time,
        offRank: null,
        offSequence: null,
        offTime: null,
        generation: channelGeneration[event.channel],
        isDrum: typeof event.isDrum === "boolean" ? event.isDrum : drumState[event.channel],
        cancelledByReset: false,
      };
      activeByIdentity.set(key, pair);
      anyOnById.set(event.noteId, pair);
      allPairs.push(pair);
      continue;
    }
    if (event.type === "noteOff") {
      if (typeof event.noteId !== "string" || !event.noteId) fail("NOTE_ID_DANGLING", `NoteOff at sequence ${event.sequence} needs a stable noteId`);
      if (!Number.isInteger(event.pitch) || event.pitch < 0 || event.pitch > 127) fail("NOTE_ID_MISMATCH", `NoteOff ${event.noteId} has an invalid pitch`);
      const key = identityKey(event);
      const pair = activeByIdentity.get(key);
      if (!pair) {
        const other = anyOnById.get(event.noteId);
        if (other?.offRank !== null && other?.offRank !== undefined) fail("NOTE_ID_DUPLICATE", `Duplicate NoteOff identity ${event.noteId}`, { channel: event.channel, pitch: event.pitch, sequence: event.sequence });
        if (other) fail("NOTE_ID_MISMATCH", `NoteOff ${event.noteId} does not match its NoteOn channel/pitch`, { expectedChannel: other.channel, expectedPitch: other.pitch, channel: event.channel, pitch: event.pitch });
        fail("NOTE_ID_DANGLING", `NoteOff ${event.noteId} has no matching NoteOn`, { channel: event.channel, pitch: event.pitch, sequence: event.sequence });
      }
      pair.offRank = rank;
      pair.offSequence = event.sequence;
      pair.offTime = event.time;
      pair.cancelledByReset = pair.generation !== channelGeneration[event.channel];
      activeByIdentity.delete(key);
      continue;
    }
    if (event.type === "cc" && RESET_CONTROLLERS.has(event.controller)) {
      channelGeneration[event.channel] += 1;
      for (const pair of activeByIdentity.values()) {
        if (pair.channel === event.channel && !pair.cancelledByReset) {
          pair.cancelledByReset = true;
          pair.resetRank = rank;
        }
      }
    }
  }

  if (activeByIdentity.size) {
    const first = activeByIdentity.values().next().value;
    fail("NOTE_ID_DANGLING", `NoteOn ${first.noteId} has no matching NoteOff`, { channel: first.channel, pitch: first.pitch, sequence: first.onSequence });
  }

  const groups = new Map();
  for (const pair of allPairs) {
    const key = `${pair.channel}:${pair.pitch}:${pair.generation}`;
    const group = groups.get(key) || [];
    group.push(pair);
    groups.set(key, group);
  }

  const assignments = [];
  const maxRequiredLanesByChannelPitch = {};
  const overflowByChannel = new Array(16).fill(0);
  let splitNotes = 0;
  let resetSegments = 0;
  for (const [key, pairs] of groups) {
    pairs.sort((left, right) => left.onRank - right.onRank);
    const tails = [];
    let generationHadReset = false;
    for (const pair of pairs) {
      const effectiveOffRank = pair.cancelledByReset ? (pair.resetRank ?? pair.offRank) : pair.offRank;
      let selectedLane = -1;
      let bestTail = -1;
      for (let lane = 0; lane < tails.length; lane += 1) {
        if (tails[lane] <= effectiveOffRank && tails[lane] > bestTail) {
          bestTail = tails[lane];
          selectedLane = lane;
        }
      }
      if (selectedLane < 0) {
        selectedLane = tails.length;
        tails.push(effectiveOffRank);
      } else tails[selectedLane] = effectiveOffRank;
      pair.lane = selectedLane;
      if (pair.cancelledByReset) generationHadReset = true;
      if (selectedLane > 0) splitNotes += 1;
    }
    const required = tails.length;
    const [channel, pitch] = key.split(":").map(Number);
    const metricKey = `${channel}:${pitch}`;
    maxRequiredLanesByChannelPitch[metricKey] = Math.max(maxRequiredLanesByChannelPitch[metricKey] || 0, required);
    overflowByChannel[channel] = Math.max(overflowByChannel[channel], required - 1);
    if (required > maxLanesPerPitch) {
      fail("NOTE_LANE_CAPACITY_EXCEEDED", `Channel ${channel}, pitch ${pitch} requires ${required} note lanes; maximum is ${maxLanesPerPitch}`, { channel, pitch, required, maximum: maxLanesPerPitch });
    }
    if (required > 1 && pairs.some((pair) => pair.isDrum)) {
      fail("DRUM_NOTE_ID_UNSUPPORTED", `Channel ${channel}, drum pitch ${pitch} needs ${required} note lanes; cross-lane exclusive-class behavior cannot be preserved`, { channel, pitch, required, reason: "drum-exclusive-class" });
    }
    if (required > 1 && pairs.some((pair) => Number(exclusiveClassByNoteId[pair.noteId]) > 0)) {
      fail("EXCLUSIVE_CLASS_LANE_CONFLICT", `Channel ${channel}, pitch ${pitch} requires overflow lanes for an exclusive-class voice`, { channel, pitch, required, reason: "exclusive-class" });
    }
    if (generationHadReset) resetSegments += 1;
    for (const pair of pairs) assignments.push({
      noteId: pair.noteId,
      channel,
      pitch,
      lane: pair.lane,
      onSequence: pair.onSequence,
      offSequence: pair.offSequence,
      cancelledByReset: pair.cancelledByReset,
    });
  }

  assignments.sort((left, right) => left.onSequence - right.onSequence);
  return {
    assignments,
    diagnostics: {
      maxLanesPerPitch,
      maxRequiredLanesByChannelPitch,
      lanesAllocated: Object.values(maxRequiredLanesByChannelPitch).reduce((sum, count) => sum + count, 0),
      overflowChannels: overflowByChannel.reduce((sum, count) => sum + count, 0),
      splitNotes,
      resetSegments,
    },
  };
}
