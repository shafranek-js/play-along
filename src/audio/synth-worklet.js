import { SoundBankLoader, SpessaSynthProcessor } from "spessasynth_core";

const CHANNELS_PER_GROUP = 16;
const FILE_CHANNEL_BASE = 0;
const LIVE_CHANNEL_BASE = CHANNELS_PER_GROUP;
const FILE_OVERFLOW_BASE = CHANNELS_PER_GROUP * 2;
const FILE_OVERFLOW_LANES = 3;
const MAX_SYNTH_CHANNELS = FILE_OVERFLOW_BASE + CHANNELS_PER_GROUP * FILE_OVERFLOW_LANES;
const MAX_PENDING_EVENTS = 50000;
const MAX_RENDER_SIZE = 8192;

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function noteIdentityKey(group, channel, pitch, noteId) {
  return `${group}:${channel}:${pitch}:${noteId}`;
}

function cloneSnapshotValue(value, seen = new WeakMap()) {
  if (value === null || typeof value !== "object") return value;
  if (ArrayBuffer.isView(value)) return value.slice();
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (seen.has(value)) return seen.get(value);
  const clone = Array.isArray(value) ? [] : {};
  seen.set(value, clone);
  for (const [key, nested] of Object.entries(value)) clone[key] = cloneSnapshotValue(nested, seen);
  return clone;
}

function compareEvents(left, right) {
  const boundaryOrder = (left.type === "cancelBoundary" ? 0 : 1) - (right.type === "cancelBoundary" ? 0 : 1);
  return left.at - right.at || boundaryOrder || left.sequence - right.sequence || left.order - right.order;
}

class SF01SynthProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    this.maxPendingEvents = Math.min(MAX_PENDING_EVENTS, Math.max(1, options.processorOptions?.maxPendingEvents ?? MAX_PENDING_EVENTS));
    this.synth = new SpessaSynthProcessor(sampleRate, {
      initialTime: currentTime,
      maxBufferSize: MAX_RENDER_SIZE,
      effectsEnabled: false,
      eventsEnabled: false,
    });
    this.synth.setSystemParameter("blackMIDIMode", false);
    while (this.synth.midiChannels.length < CHANNELS_PER_GROUP * 2) this.synth.createMIDIChannel();
    this.scratchLeft = new Float32Array(MAX_RENDER_SIZE);
    this.scratchRight = new Float32Array(MAX_RENDER_SIZE);
    const initialEpochs = options.processorOptions?.epochs || {};
    this.epochs = {
      file: Number.isInteger(initialEpochs.file) && initialEpochs.file >= 0 ? initialEpochs.file : 0,
      live: Number.isInteger(initialEpochs.live) && initialEpochs.live >= 0 ? initialEpochs.live : 0,
    };
    this.queue = [];
    this.activeNoteRoutes = new Map();
    this.invalidatedNoteIds = new Set();
    this.noteIds = new Set();
    this.eventSequence = 0;
    this.cancelledEvents = 0;
    this.staleEventsDropped = 0;
    this.eventsRejected = 0;
    this.deferredNoteOffs = 0;
    this.staleNoteOffsSuppressed = 0;
    this.clockCatchupFrames = 0;
    this.clockCatchupBlocks = 0;
    this.maxClockSkewSeconds = 0;
    this.metricsDirty = false;
    this.eventsApplied = 0;
    this.timingSamples = [];
    this.disposed = false;
    this.bankId = null;
    this.activeSoundBank = null;
    this.preparedSamples = new WeakSet();
    this.port.onmessage = (event) => this.handleMessage(event.data);
    this.synth.processorInitialized.then(() => this.postMetrics()).catch((error) => {
      this.port.postMessage({ type: "ready-error", error: String(error?.stack || error) });
    });
  }

  handleMessage(message) {
    switch (message.type) {
      case "initialize":
        this.synth.processorInitialized.then(() => {
          if (!this.disposed) this.port.postMessage({ type: "ready", requestId: message.requestId });
        }).catch((error) => {
          this.port.postMessage({ type: "ready-error", requestId: message.requestId, error: String(error?.stack || error) });
        });
        break;
      case "load-bank":
        this.loadBank(message);
        break;
      case "prepare-patches":
        this.preparePatches(message);
        break;
      case "schedule-event":
        this.scheduleEvent(message.event);
        break;
      case "cancel-group":
        this.cancelGroup(message);
        break;
      case "set-effects":
        this.setEffects(message);
        break;
      case "dispose":
        this.dispose(message);
        break;
      default:
        break;
    }
  }

  loadBank(message) {
    try {
      const startedAt = nowMs();
      for (let channel = 0; channel < CHANNELS_PER_GROUP * 2; channel += 1) this.synth.midiChannels[channel]?.stopAllNotes(true);
      this.queue.length = 0;
      this.activeNoteRoutes.clear();
      this.invalidatedNoteIds.clear();
      this.noteIds.clear();
      const soundBank = SoundBankLoader.fromArrayBuffer(message.bytes);
      this.synth.soundBankManager.addSoundBank(soundBank, "sf01-active-bank", 0);
      this.configureGroupChannels(FILE_CHANNEL_BASE);
      this.configureGroupChannels(LIVE_CHANNEL_BASE);
      this.configureFileOverflowChannels();
      this.activeSoundBank = soundBank;
      this.bankId = message.bankId;
      this.preparedSamples = new WeakSet();
      const presetList = this.synth.soundBankManager.presetList.map((preset) => ({
        name: preset.name,
        program: preset.program,
        bankMSB: preset.bankMSB,
        bankLSB: preset.bankLSB,
        isDrum: preset.isDrum,
        isGMGSDrum: preset.isGMGSDrum,
      }));
      this.port.postMessage({
        type: "loaded",
        requestId: message.requestId,
        bankId: message.bankId,
        format: message.format,
        bytes: message.bytes.byteLength,
        parseMs: nowMs() - startedAt,
        presetList,
      });
      this.postMetrics();
    } catch (error) {
      this.port.postMessage({ type: "load-error", requestId: message.requestId, error: String(error?.stack || error) });
    }
  }

  configureGroupChannels(base) {
    for (let localChannel = 0; localChannel < CHANNELS_PER_GROUP; localChannel += 1) {
      const channel = this.synth.midiChannels[base + localChannel];
      if (!channel) throw new Error(`Missing MIDI channel ${base + localChannel}`);
      channel.setDrums(localChannel === 9);
      this.synth.controllerChange(base + localChannel, 0, 0);
      this.synth.controllerChange(base + localChannel, 32, 0);
      this.synth.programChange(base + localChannel, 0);
      channel.setDrums(localChannel === 9);
    }
  }

  configureFileOverflowChannels() {
    while (this.synth.midiChannels.length < MAX_SYNTH_CHANNELS) this.synth.createMIDIChannel();
    const snapshot = this.synth.getSnapshot();
    for (let logicalChannel = 0; logicalChannel < CHANNELS_PER_GROUP; logicalChannel += 1) {
      const source = snapshot.midiChannels[logicalChannel];
      for (let lane = 1; lane <= FILE_OVERFLOW_LANES; lane += 1) {
        const targetChannel = FILE_OVERFLOW_BASE + logicalChannel * FILE_OVERFLOW_LANES + lane - 1;
        const target = cloneSnapshotValue(source);
        target.channel = targetChannel;
        snapshot.midiChannels[targetChannel] = target;
      }
    }
    this.synth.applySnapshot(snapshot);
  }

  physicalChannel(group, logicalChannel, lane = 0) {
    if (group === "live") return LIVE_CHANNEL_BASE + logicalChannel;
    if (lane === 0) return FILE_CHANNEL_BASE + logicalChannel;
    if (lane < 1 || lane > FILE_OVERFLOW_LANES) throw new Error(`Unsupported file note lane ${lane}`);
    return FILE_OVERFLOW_BASE + logicalChannel * FILE_OVERFLOW_LANES + lane - 1;
  }

  channelFanout(group, logicalChannel) {
    const channels = [this.physicalChannel(group, logicalChannel, 0)];
    if (group === "file") {
      for (let lane = 1; lane <= FILE_OVERFLOW_LANES; lane += 1) channels.push(this.physicalChannel(group, logicalChannel, lane));
    }
    return channels;
  }

  preparePatches(message) {
    const startedAt = nowMs();
    try {
      if (!this.bankId) throw new Error("No indexed bank is loaded");
      const inventory = this.synth.soundBankManager.presetList;
      if (!this.activeSoundBank) throw new Error("The indexed SoundFont object is unavailable");
      const warmedThisRequest = new Set();
      let uniqueSampleCount = 0;
      let reusedSampleCount = 0;
      const patches = [];
      const exclusiveClasses = [];
      for (const request of message.requests) {
        const metadata = inventory.find((candidate) => candidate.bankMSB === request.bankMSB
          && candidate.bankLSB === request.bankLSB
          && candidate.program === request.program
          && candidate.isDrum === request.isDrum);
        if (!metadata) throw Object.assign(new Error(`Preset ${request.bankMSB}:${request.bankLSB}:${request.program} was not found`), { code: "PREPARE_PATCH_NOT_FOUND" });
        const preset = this.activeSoundBank.getPreset(metadata, this.synth.midiParameters.system);
        if (!preset || preset.bankMSB !== metadata.bankMSB || preset.bankLSB !== metadata.bankLSB
            || preset.program !== metadata.program || preset.isDrum !== metadata.isDrum
            || preset.name !== metadata.name) {
          throw Object.assign(new Error(`Preset metadata did not resolve to the requested sound bank patch ${request.bankMSB}:${request.bankLSB}:${request.program}`), { code: "PREPARE_PATCH_NOT_FOUND" });
        }
        for (const note of request.notes) {
          const voices = preset.getVoiceParameters(note.pitch, note.velocity);
          if (!voices.length) throw Object.assign(new Error(`Preset ${preset.name} has no sample zone for ${note.pitch}/${note.velocity}`), { code: "PREPARE_SAMPLE" });
          let exclusiveClass = 0;
          for (const voice of voices) {
            const sample = voice.sample;
            if (!sample) throw Object.assign(new Error(`Preset ${preset.name} produced a voice without a sample`), { code: "PREPARE_SAMPLE" });
            exclusiveClass = Math.max(exclusiveClass, Number(voice.generators?.[57]) || 0);
            if (!warmedThisRequest.has(sample)) {
              warmedThisRequest.add(sample);
              uniqueSampleCount += 1;
              if (this.preparedSamples.has(sample)) reusedSampleCount += 1;
            const audioData = sample.getAudioData();
            if (!(audioData instanceof Float32Array) || audioData.length < 1) {
              throw Object.assign(new Error(`Sample decode returned no PCM for ${preset.name} at ${note.pitch}/${note.velocity}`), { code: "PREPARE_SAMPLE" });
            }
            for (const index of [0, Math.floor((audioData.length - 1) / 2), audioData.length - 1]) {
              if (!Number.isFinite(audioData[index])) {
                throw Object.assign(new Error(`Sample decode returned non-finite PCM for ${preset.name}`), { code: "PREPARE_SAMPLE" });
              }
            }
              this.preparedSamples.add(sample);
            }
          }
          exclusiveClasses.push({
            bankMSB: request.bankMSB,
            bankLSB: request.bankLSB,
            program: request.program,
            isDrum: request.isDrum,
            pitch: note.pitch,
            velocity: note.velocity,
            exclusiveClass,
          });
        }
        patches.push({ bankMSB: request.bankMSB, bankLSB: request.bankLSB, program: request.program, isDrum: request.isDrum, name: preset.name, noteCount: request.notes.length });
      }
      const elapsedMs = nowMs() - startedAt;
      this.port.postMessage({ type: "prepared", requestId: message.requestId, elapsedMs, uniqueSampleCount, reusedSampleCount, patches, exclusiveClasses });
    } catch (error) {
      this.port.postMessage({ type: "prepare-error", requestId: message.requestId, code: error.code || "PREPARE_SAMPLE", error: String(error?.stack || error) });
    }
  }

  scheduleEvent(event) {
    if (this.disposed) return;
    if (!(event.group in this.epochs)) {
      this.dropEvent(event, "invalid-group");
      return;
    }
    if (event.epoch !== this.epochs[event.group]) {
      this.staleEventsDropped += 1;
      this.dropEvent(event, "stale-epoch");
      return;
    }
    if (event.lane !== undefined && (event.group !== "file" || !Number.isInteger(event.lane) || event.lane < 0 || event.lane > FILE_OVERFLOW_LANES)) {
      this.dropEvent(event, "invalid-lane");
      return;
    }
    if (this.queue.length >= this.maxPendingEvents) {
      this.dropEvent(event, "queue-limit");
      return;
    }
    this.insertQueueEvent({ ...event, order: ++this.eventSequence });
    this.metricsDirty = true;
  }

  dropEvent(event, reason) {
    this.eventsRejected += 1;
    this.port.postMessage({ type: "event-dropped", sequence: event?.sequence, group: event?.group, reason });
    this.metricsDirty = true;
  }

  insertQueueEvent(event) {
    let low = 0;
    let high = this.queue.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (compareEvents(this.queue[middle], event) <= 0) low = middle + 1;
      else high = middle;
    }
    this.queue.splice(low, 0, event);
  }

  cancelGroup({ group, epoch, at, requestId }) {
    if (!(group in this.epochs) || !Number.isInteger(epoch) || epoch <= this.epochs[group]) {
      this.port.postMessage({ type: "cancelled", requestId, group, epoch, removedEvents: 0, activeNotes: this.noteIds.size, error: "invalid epoch or group" });
      return;
    }
    const previousEpoch = this.epochs[group];
    this.epochs[group] = epoch;
    const retained = [];
    let removedEvents = 0;
    for (const event of this.queue) {
      if (event.group !== group || event.epoch >= epoch) retained.push(event);
      else if (event.at < at) retained.push({ ...event, epoch });
      else removedEvents += 1;
    }
    this.queue = retained;
    this.insertQueueEvent({ type: "cancelBoundary", group, epoch, at, sequence: -1, order: ++this.eventSequence });
    this.cancelledEvents += removedEvents;
    this.metricsDirty = true;
    this.port.postMessage({ type: "cancelled", requestId, group, previousEpoch, epoch, removedEvents, activeNotes: this.noteIds.size, pendingEvents: this.queue.length });
    this.postMetrics();
  }

  applyCancelBoundary(group) {
    const channels = group === "file"
      ? Array.from({ length: CHANNELS_PER_GROUP }, (_, channel) => this.channelFanout(group, channel)).flat()
      : Array.from({ length: CHANNELS_PER_GROUP }, (_, channel) => this.physicalChannel(group, channel));
    for (const channel of channels) this.synth.midiChannels[channel]?.stopAllNotes(true);
    const prefix = `${group}:`;
    for (const key of this.activeNoteRoutes.keys()) if (key.startsWith(prefix)) this.activeNoteRoutes.delete(key);
    for (const key of this.invalidatedNoteIds) if (key.startsWith(prefix)) this.invalidatedNoteIds.delete(key);
    for (const key of this.noteIds) if (key.startsWith(prefix)) this.noteIds.delete(key);
  }

  applyEvent(event, actualAt) {
    if (event.epoch !== this.epochs[event.group]) {
      this.staleEventsDropped += 1;
      this.dropEvent(event, "stale-before-apply");
      return;
    }
    if (event.type === "cancelBoundary") {
      this.applyCancelBoundary(event.group);
      this.metricsDirty = true;
      return;
    }
    const channel = this.physicalChannel(event.group, event.channel, event.lane ?? 0);
    let applied = true;
    switch (event.type) {
      case "noteOn":
        applied = this.applyNoteOn(event, channel);
        break;
      case "noteOff":
        applied = this.applyNoteOff(event, channel);
        break;
      case "programChange":
        for (const target of this.channelFanout(event.group, event.channel)) {
          if (event.isDrum !== undefined) this.synth.midiChannels[target].setDrums(event.isDrum);
          if (event.bankMSB !== undefined) this.synth.controllerChange(target, 0, event.bankMSB);
          if (event.bankLSB !== undefined) this.synth.controllerChange(target, 32, event.bankLSB);
          this.synth.programChange(target, event.program);
        }
        break;
      case "cc":
        for (const target of this.channelFanout(event.group, event.channel)) this.synth.controllerChange(target, event.controller, event.value);
        if ([120, 123, 124, 125, 126, 127].includes(event.controller)) this.invalidateChannelNotes(event.group, event.channel);
        break;
      case "pitchWheel":
        for (const target of this.channelFanout(event.group, event.channel)) this.synth.pitchWheel(target, event.value);
        break;
      case "channelPressure":
        for (const target of this.channelFanout(event.group, event.channel)) this.synth.channelPressure(target, event.value);
        break;
      case "polyPressure":
        for (const target of this.channelFanout(event.group, event.channel)) this.synth.polyPressure(target, event.pitch, event.value);
        break;
      default:
        applied = false;
        break;
    }
    this.metricsDirty = true;
    if (!applied) return;
    this.eventsApplied += 1;
    this.timingSamples.push({
      sequence: event.sequence,
      group: event.group,
      eventType: event.type,
      scheduledAt: event.at,
      actualAt,
      errorSeconds: actualAt - event.at,
    });
    if (this.timingSamples.length > 256) this.timingSamples.shift();
  }

  applyNoteOn(event, channel) {
    const identityKey = noteIdentityKey(event.group, event.channel, event.pitch, event.noteId);
    if (this.activeNoteRoutes.has(identityKey)) {
      this.dropEvent(event, "duplicate-note-id");
      return false;
    }
    const route = { noteId: event.noteId, identityKey, physicalChannel: channel, lane: event.lane ?? 0 };
    this.activeNoteRoutes.set(identityKey, route);
    this.noteIds.add(identityKey);
    this.synth.noteOn(channel, event.pitch, event.velocity);
    return true;
  }

  applyNoteOff(event, channel) {
    const identityKey = noteIdentityKey(event.group, event.channel, event.pitch, event.noteId);
    const route = this.activeNoteRoutes.get(identityKey);
    if (!route) {
      if (this.invalidatedNoteIds.delete(identityKey)) {
        this.staleNoteOffsSuppressed += 1;
        this.metricsDirty = true;
        return false;
      }
      this.dropEvent(event, "unknown-note-id");
      return false;
    }
    this.synth.noteOff(route.physicalChannel, event.pitch);
    this.activeNoteRoutes.delete(identityKey);
    this.noteIds.delete(identityKey);
    return true;
  }

  invalidateChannelNotes(group, logicalChannel) {
    const prefix = `${group}:${logicalChannel}:`;
    for (const [identityKey, route] of this.activeNoteRoutes) {
      if (!identityKey.startsWith(prefix)) continue;
      this.activeNoteRoutes.delete(identityKey);
      this.noteIds.delete(identityKey);
      this.invalidatedNoteIds.add(identityKey);
    }
    while (this.invalidatedNoteIds.size > MAX_PENDING_EVENTS) this.invalidatedNoteIds.delete(this.invalidatedNoteIds.values().next().value);
  }

  setEffects(message) {
    try {
      this.synth.setSystemParameter("reverbGain", message.reverbGain);
      this.synth.setSystemParameter("chorusGain", message.chorusGain);
      this.synth.setSystemParameter("effectsEnabled", message.enabled);
      this.port.postMessage({ type: "effects-set", requestId: message.requestId, enabled: message.enabled });
    } catch (error) {
      this.port.postMessage({ type: "effects-error", requestId: message.requestId, error: String(error?.stack || error) });
    }
  }

  dispose(message) {
    try {
      this.disposed = true;
      this.queue.length = 0;
      this.activeNoteRoutes.clear();
      this.invalidatedNoteIds.clear();
      this.noteIds.clear();
      this.synth.destroySynthProcessor();
      this.activeSoundBank = null;
      this.port.postMessage({ type: "disposed", requestId: message.requestId });
    } catch (error) {
      this.port.postMessage({ type: "dispose-error", requestId: message.requestId, error: String(error?.stack || error) });
    }
  }

  postMetrics() {
    this.port.postMessage({
      type: "worker-metrics",
      pendingEvents: this.queue.length,
      activeNotes: this.noteIds.size,
      voiceCount: this.synth.voiceCount,
      channelCount: this.synth.midiChannels.length,
      cancelledEvents: this.cancelledEvents,
      staleEventsDropped: this.staleEventsDropped,
      eventsRejected: this.eventsRejected,
      deferredNoteOffs: this.deferredNoteOffs,
      staleNoteOffsSuppressed: this.staleNoteOffsSuppressed,
      eventsApplied: this.eventsApplied,
      timingSamples: this.timingSamples,
      maxPendingEvents: this.maxPendingEvents,
      clockCatchupFrames: this.clockCatchupFrames,
      clockCatchupBlocks: this.clockCatchupBlocks,
      maxClockSkewSeconds: this.maxClockSkewSeconds,
    });
  }

  renderSegment(left, right, start, count) {
    if (count > 0) this.synth.process(left, right, start, count);
  }

  advanceClockTo(audioTime) {
    const skew = audioTime - this.synth.currentTime;
    if (skew <= 0) return;
    this.maxClockSkewSeconds = Math.max(this.maxClockSkewSeconds, skew);
    let framesRemaining = Math.round(skew * sampleRate);
    while (framesRemaining > 0) {
      const chunkStart = this.synth.currentTime;
      const chunkFrames = Math.min(MAX_RENDER_SIZE, framesRemaining);
      const chunkEnd = chunkStart + chunkFrames / sampleRate;
      let cursor = 0;
      while (this.queue.length && this.queue[0].at < chunkEnd) {
        const event = this.queue.shift();
        const eventFrame = Math.max(cursor, Math.min(chunkFrames, Math.round((event.at - chunkStart) * sampleRate)));
        this.renderSegment(this.scratchLeft, this.scratchRight, cursor, eventFrame - cursor);
        cursor = eventFrame;
        this.applyEvent(event, chunkStart + eventFrame / sampleRate);
      }
      this.renderSegment(this.scratchLeft, this.scratchRight, cursor, chunkFrames - cursor);
      this.clockCatchupFrames += chunkFrames;
      this.clockCatchupBlocks += 1;
      framesRemaining -= chunkFrames;
    }
    this.metricsDirty = true;
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length < 2) return !this.disposed;
    const left = output[0];
    const right = output[1];
    left.fill(0);
    right.fill(0);
    if (this.disposed) return false;
    const frames = left.length;
    const blockStart = currentTime;
    this.advanceClockTo(blockStart);
    const blockEnd = blockStart + frames / sampleRate;
    let cursor = 0;
    while (this.queue.length && this.queue[0].at < blockEnd) {
      const event = this.queue.shift();
      const frameOffset = Math.max(cursor, Math.min(frames, Math.round((event.at - blockStart) * sampleRate)));
      if (frameOffset > cursor) this.synth.process(left, right, cursor, frameOffset - cursor);
      cursor = frameOffset;
      this.applyEvent(event, blockStart + frameOffset / sampleRate);
    }
    if (cursor < frames) this.synth.process(left, right, cursor, frames - cursor);
    if (this.metricsDirty) {
      this.metricsDirty = false;
      this.postMetrics();
    }
    return true;
  }
}

registerProcessor("sf01-synth", SF01SynthProcessor);
