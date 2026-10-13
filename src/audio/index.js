import { planNoteLanes as planNoteLanesInternal } from "./note-lanes.js";

const GROUPS = new Set(["file", "live"]);
const EVENT_TYPES = new Set(["noteOn", "noteOff", "programChange", "cc", "pitchWheel", "channelPressure", "polyPressure"]);
const BANK_CACHE_NAME = "play-along-soundfont-bank-v1";
const MAX_PENDING_EVENTS = 50000;
const MAX_CAPTURE_SECONDS = 10;
const DISPOSE_TIMEOUT_MS = 1200;
const CACHE_OPERATION_TIMEOUT_MS = 1500;
const contexts = new WeakMap();

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function engineError(code, message, cause) {
  return new EngineError(code, message, cause);
}

export class EngineError extends Error {
  constructor(code, message, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "EngineError";
    this.code = code;
  }
}

export function planNoteLanes(events, options) {
  try {
    return planNoteLanesInternal(events, options);
  } catch (error) {
    if (!error?.code || error instanceof EngineError) throw error;
    const normalized = engineError(error.code, error.message, error);
    Object.assign(normalized, error.details || {});
    if (Number.isInteger(error.details?.maximum)) normalized.max = error.details.maximum;
    throw normalized;
  }
}

function assertGroup(group) {
  if (!GROUPS.has(group)) throw new TypeError(`group must be "file" or "live"`);
}

function assertInt(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  }
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(engineError("ENGINE_TIMEOUT", `${label} exceeded ${timeoutMs} ms`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function validateCatalog(catalog) {
  if (!catalog || catalog.schemaVersion !== 1 || !Array.isArray(catalog.banks)) {
    throw engineError("CATALOG_MANIFEST", "SoundFont manifest must have schemaVersion 1 and a banks array");
  }
  const ids = new Set();
  const banks = catalog.banks.map((bank) => {
    if (!bank || typeof bank.id !== "string" || !bank.id || ids.has(bank.id)) {
      throw engineError("CATALOG_MANIFEST", "SoundFont manifest contains a missing or duplicate bank ID");
    }
    ids.add(bank.id);
    if (typeof bank.url !== "string" || !bank.url || bank.url.startsWith("/")) {
      throw engineError("CATALOG_MANIFEST", `Bank ${bank.id} must use a non-root-relative URL`);
    }
    if (bank.format !== "SF2" && bank.format !== "SF3") {
      throw engineError("CATALOG_MANIFEST", `Bank ${bank.id} has unsupported format`);
    }
    if (!Number.isSafeInteger(bank.bytes) || bank.bytes < 12) {
      throw engineError("CATALOG_MANIFEST", `Bank ${bank.id} has an invalid byte count`);
    }
    if (typeof bank.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(bank.sha256)) {
      throw engineError("CATALOG_MANIFEST", `Bank ${bank.id} has an invalid SHA-256 digest`);
    }
    if (!Array.isArray(bank.noticeFiles) || bank.noticeFiles.some((name) => typeof name !== "string" || !name)) {
      throw engineError("CATALOG_MANIFEST", `Bank ${bank.id} must list its notice files`);
    }
    return { ...bank };
  });
  const defaultBankId = catalog.defaultBankId ?? banks[0]?.id;
  if (typeof defaultBankId !== "string" || !ids.has(defaultBankId)) {
    throw engineError("CATALOG_MANIFEST", "SoundFont manifest defaultBankId must name a bank in the catalog");
  }
  return { ...catalog, defaultBankId, banks };
}

function currentOrigin() {
  return globalThis.location?.origin ?? null;
}

function resolveSameOrigin(url, baseUrl, label) {
  let resolved;
  try {
    resolved = new URL(url, baseUrl);
  } catch (cause) {
    throw engineError("CATALOG_MANIFEST", `${label} URL is invalid`, cause);
  }
  const origin = currentOrigin();
  if (resolved.origin !== baseUrl.origin || (origin && resolved.origin !== origin)) {
    throw engineError("CATALOG_MANIFEST", `${label} must be same-origin`);
  }
  let decodedPath = resolved.pathname;
  let decodedBaseDirectory;
  try {
    decodedBaseDirectory = decodeURIComponent(new URL(".", baseUrl).pathname);
    for (let depth = 0; depth < 8; depth += 1) {
      const next = decodeURIComponent(decodedPath);
      if (next === decodedPath) break;
      decodedPath = next;
    }
    if (/%(?:2e|2f|5c|25)/i.test(decodedPath)) throw new URIError("Encoded path syntax remains after normalization");
  } catch (cause) {
    throw engineError("CATALOG_MANIFEST", `${label} URL has invalid path encoding`, cause);
  }
  if (decodedPath.includes("\\") || !decodedPath.startsWith(decodedBaseDirectory)
      || decodedPath.split("/").some((segment) => segment === "..")) {
    throw engineError("CATALOG_MANIFEST", `${label} URL cannot escape the asset directory`);
  }
  if (resolved.username || resolved.password) throw engineError("CATALOG_MANIFEST", `${label} URL cannot contain credentials`);
  return resolved;
}

function resolveSameOriginUrl(url, baseUrl, label) {
  let resolved;
  try { resolved = new URL(url, baseUrl); }
  catch (cause) { throw engineError("CATALOG_MANIFEST", `${label} URL is invalid`, cause); }
  const origin = currentOrigin();
  if (origin && (resolved.origin !== baseUrl.origin || resolved.origin !== origin)) {
    throw engineError("CATALOG_MANIFEST", `${label} must be same-origin`);
  }
  if (resolved.username || resolved.password) throw engineError("CATALOG_MANIFEST", `${label} URL cannot contain credentials`);
  return resolved;
}

async function sha256Hex(cryptoImpl, bytes) {
  if (!cryptoImpl?.subtle?.digest) throw engineError("INTEGRITY_UNAVAILABLE", "Web Crypto SHA-256 is unavailable");
  try {
    const digest = await cryptoImpl.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch (cause) {
    throw engineError("INTEGRITY_UNAVAILABLE", "Could not compute SoundFont SHA-256", cause);
  }
}

async function validateBankBytes(bank, bytes, cryptoImpl) {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== bank.bytes) {
    throw engineError("BANK_SIZE", `Bank ${bank.id} byte count does not match its manifest`);
  }
  const data = new Uint8Array(bytes);
  if (String.fromCharCode(...data.subarray(0, 4)) !== "RIFF"
      || String.fromCharCode(...data.subarray(8, 12)) !== "sfbk") {
    throw engineError("BANK_MAGIC", `Bank ${bank.id} is not a RIFF SoundFont bank`);
  }
  const actualHash = await sha256Hex(cryptoImpl, bytes);
  if (actualHash.toLowerCase() !== bank.sha256.toLowerCase()) {
    throw engineError("BANK_HASH", `Bank ${bank.id} SHA-256 does not match its manifest`);
  }
  return actualHash;
}

function cacheKeyFor(url, bank) {
  const key = new URL(url.href);
  key.searchParams.set("__sf01_sha256", bank.sha256.toLowerCase());
  return typeof Request === "function" ? new Request(key.href, { method: "GET" }) : key.href;
}

class PlaybackAudioEngine {
  constructor(context, options, synthNode, gainNode, metrics, registration) {
    this.context = context;
    this.options = options;
    this.synthNode = synthNode;
    this.gainNode = gainNode;
    this.metrics = metrics;
    this.registration = registration;
    this.epochs = { file: 0, live: 0 };
    this.requestSequence = 0;
    this.eventSequence = 0;
    this.pendingRequests = new Map();
    this.captureRequests = new Map();
    this.presetList = [];
    this.catalog = options.catalog ? validateCatalog(options.catalog) : null;
    this.catalogUrl = options.catalogUrl;
    this.catalogPromise = null;
    this.disposed = false;
    this.disposePromise = null;
    this.resolveDisposeAck = null;
    this.disposeRequestId = null;
    this.bankGeneration = 0;
    this.bankAbort = null;
    this.bankPromise = null;
    this.bankPromiseId = null;
    this.currentBankId = null;
    this.preparedRequestKeys = new Set();
    this.tapNode = null;
    this.tapLoadPromise = null;
    this.replacementNodes = new Set();
    this.initializationPromise = Promise.resolve();
    this.state = {
      lifecycle: "initializing",
      engineReady: false,
      bankIndexed: false,
      bankId: null,
      preparedPatches: [],
      disposed: false,
    };
    const initialSynthNode = this.synthNode;
    initialSynthNode.port.onmessage = (event) => this.handleSynthMessage(event.data, initialSynthNode);
    initialSynthNode.onprocessorerror = (event) => this.handleProcessorError(event, initialSynthNode);
    this.options.onEventDropped && (this.onEventDropped = this.options.onEventDropped);
  }

  initialize() {
    return this.initializationPromise;
  }

  handleProcessorError(event, sourceNode = this.synthNode) {
    const error = engineError("PROCESSOR_ERROR", `AudioWorklet processor failed: ${event.message || "unknown error"}`);
    if (sourceNode !== this.synthNode) {
      this.failRequestsForNode(sourceNode, error);
      return;
    }
    this.metrics.processorError = error.message;
    this.state = { ...this.state, lifecycle: "error" };
    this.failAllRequests(error);
    this.resolveDisposeAck?.(false, error.message);
  }

  failRequestsForNode(node, error) {
    for (const [id, request] of this.pendingRequests) {
      if (request.node !== node) continue;
      clearTimeout(request.timeoutId);
      request.reject(error);
      this.pendingRequests.delete(id);
    }
  }

  failAllRequests(error) {
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeoutId);
      request.reject(error);
      this.pendingRequests.delete(id);
    }
    for (const [id, request] of this.captureRequests) {
      clearTimeout(request.timeoutId);
      request.reject(error);
      this.captureRequests.delete(id);
    }
  }

  handleTapProcessorError(event) {
    const message = `PCM tap processor failed: ${event.message || "unknown error"}`;
    this.metrics.pcmTapError = message;
    for (const [id, request] of this.captureRequests) {
      clearTimeout(request.timeoutId);
      request.reject(engineError("PCM_CAPTURE", message));
      this.captureRequests.delete(id);
    }
  }

  handleSynthMessage(message, sourceNode = this.synthNode) {
    const isActiveNode = sourceNode === this.synthNode;
    if (message.type === "ready") {
      if (isActiveNode && !this.metrics.engineReady) {
        this.metrics.engineReadyAt = nowMs();
        this.metrics.initializationMs = this.metrics.engineReadyAt - this.metrics.createdAt;
        this.metrics.engineReady = true;
      }
      if (isActiveNode) {
        this.state.engineReady = true;
        if (this.state.lifecycle === "initializing") this.state.lifecycle = "engine-ready";
      }
      this.finishRequest(message.requestId, message);
      return;
    }
    if (message.type === "ready-error") {
      this.finishRequest(message.requestId, null, engineError("PROCESSOR_ERROR", message.error || "Synth processor initialization failed"));
      return;
    }
    if (message.type === "loaded") {
      this.finishRequest(message.requestId, message);
      return;
    }
    if (message.type === "load-error") {
      this.finishRequest(message.requestId, null, engineError("BANK_PARSE", message.error || "SoundFont parse failed"));
      return;
    }
    if (message.type === "prepared") {
      this.finishRequest(message.requestId, message);
      return;
    }
    if (message.type === "prepare-error") {
      this.finishRequest(message.requestId, null, engineError(message.code || "PREPARE_SAMPLE", message.error || "SoundFont patch preparation failed"));
      return;
    }
    if (message.type === "effects-set" || message.type === "cancelled") {
      if (isActiveNode && message.type === "cancelled") {
        this.metrics.cancelCount += 1;
        this.metrics.cancelledEvents += message.removedEvents || 0;
        this.metrics.activeNotes = message.activeNotes || 0;
      }
      this.finishRequest(message.requestId, message);
      return;
    }
    if (message.type === "effects-error") {
      this.finishRequest(message.requestId, null, engineError("EFFECTS_ERROR", message.error || "Could not set effects"));
      return;
    }
    if (message.type === "disposed") {
      if (isActiveNode && message.requestId === this.disposeRequestId) this.resolveDisposeAck?.(true);
      else this.finishRequest(message.requestId, message);
      return;
    }
    if (message.type === "dispose-error") {
      if (isActiveNode && message.requestId === this.disposeRequestId) this.resolveDisposeAck?.(false, message.error || "Synth disposal failed");
      else this.finishRequest(message.requestId, null, engineError("PROCESSOR_ERROR", message.error || "Synth disposal failed"));
      return;
    }
    if (message.type === "event-dropped") {
      if (!isActiveNode) return;
      this.metrics.eventsRejected += 1;
      if (message.reason?.startsWith("stale")) this.metrics.staleEventsDropped += 1;
      this.onEventDropped?.({ ...message });
      return;
    }
    if (message.type === "noteoff-deferred") {
      if (!isActiveNode) return;
      this.metrics.deferredNoteOffs += 1;
      return;
    }
    if (message.type === "event-applied") {
      if (!isActiveNode) return;
      this.metrics.eventsApplied += 1;
      this.metrics.timingSamples.push({
        sequence: message.sequence,
        eventType: message.eventType,
        group: message.group,
        scheduledAt: message.scheduledAt,
        actualAt: message.actualAt,
        errorSeconds: message.errorSeconds,
      });
      if (this.metrics.timingSamples.length > 256) this.metrics.timingSamples.shift();
      return;
    }
    if (message.type === "worker-metrics") {
      if (!isActiveNode) return;
      this.metrics.pendingEvents = message.pendingEvents;
      this.metrics.activeNotes = message.activeNotes;
      this.metrics.voiceCount = message.voiceCount;
      this.metrics.channelCount = message.channelCount;
      this.metrics.staleEventsDropped = message.staleEventsDropped;
      this.metrics.eventsRejected = message.eventsRejected;
      this.metrics.deferredNoteOffs = message.deferredNoteOffs;
      this.metrics.staleNoteOffsSuppressed = message.staleNoteOffsSuppressed || 0;
      this.metrics.maxClockSkewSeconds = message.maxClockSkewSeconds;
      this.metrics.eventsApplied = message.eventsApplied || 0;
      this.metrics.timingSamples = (message.timingSamples || []).slice(-256);
      return;
    }
    if (message.requestId) this.finishRequest(message.requestId, message);
  }

  handleTapMessage(message) {
    const request = this.captureRequests.get(message.requestId);
    if (!request) return;
    if (message.type === "capture-error") {
      this.captureRequests.delete(message.requestId);
      clearTimeout(request.timeoutId);
      request.reject(engineError("PCM_CAPTURE", message.error || "PCM capture failed"));
      return;
    }
    if (message.type !== "capture-result") return;
    this.captureRequests.delete(message.requestId);
    clearTimeout(request.timeoutId);
    const samples = [new Float32Array(message.left), new Float32Array(message.right)];
    let peak = 0;
    let sumSquares = 0;
    let count = 0;
    for (const channel of samples) {
      for (const sample of channel) {
        peak = Math.max(peak, Math.abs(sample));
        sumSquares += sample * sample;
      }
      count += channel.length;
    }
    request.resolve({
      sampleRate: message.sampleRate,
      channels: 2,
      frames: message.frames,
      startedAt: message.startedAt,
      endedAt: message.endedAt,
      samples,
      peak,
      rms: count ? Math.sqrt(sumSquares / count) : 0,
    });
  }

  finishRequest(requestId, result, error) {
    const request = this.pendingRequests.get(requestId);
    if (!request) return;
    this.pendingRequests.delete(requestId);
    clearTimeout(request.timeoutId);
    if (error) request.reject(error);
    else request.resolve(result);
  }

  assertActive() {
    if (this.disposed) throw engineError("ENGINE_DISPOSED", "Audio engine has been disposed");
    if (this.metrics.processorError) throw engineError("PROCESSOR_ERROR", this.metrics.processorError);
  }

  requestWorker(type, payload = {}, transfer = [], timeoutMs = this.options.requestTimeoutMs, node = this.synthNode) {
    this.assertActive();
    const requestId = ++this.requestSequence;
    const promise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(engineError("ENGINE_TIMEOUT", `AudioWorklet request ${type} timed out`));
      }, timeoutMs);
      this.pendingRequests.set(requestId, { resolve, reject, timeoutId, type, node });
    });
    try {
      node.port.postMessage({ type, requestId, ...payload }, transfer);
    } catch (cause) {
      this.finishRequest(requestId, null, engineError("PROCESSOR_ERROR", `Could not post ${type} request`, cause));
    }
    return promise;
  }

  async getCatalog() {
    this.assertActive();
    if (this.catalog) return this.catalog;
    if (this.catalogPromise) return this.catalogPromise;
    const promise = (async () => {
      const url = this.options.catalogUrl;
      let response;
      try {
        response = await this.options.fetchImpl(url.href, { credentials: "same-origin", mode: "same-origin" });
      } catch (cause) {
        throw engineError("CATALOG_NETWORK", "Could not fetch the SoundFont manifest", cause);
      }
      if (!response.ok) throw engineError("CATALOG_HTTP", `SoundFont manifest request failed: ${response.status}`);
      let parsed;
      try {
        parsed = await response.json();
      } catch (cause) {
        throw engineError("CATALOG_MANIFEST", "SoundFont manifest is not valid JSON", cause);
      }
      this.catalog = validateCatalog(parsed);
      return this.catalog;
    })();
    this.catalogPromise = promise;
    try { return await promise; }
    finally { if (this.catalogPromise === promise) this.catalogPromise = null; }
  }

  async openBankCache() {
    if (!this.options.cacheStorage?.open) {
      this.metrics.cache.disabled += 1;
      return null;
    }
    try {
      return await withTimeout(this.options.cacheStorage.open(this.options.cacheName), CACHE_OPERATION_TIMEOUT_MS, "Cache open");
    } catch (error) {
      this.metrics.cache.fallbacks += 1;
      this.metrics.cache.lastError = String(error?.message || error);
      return null;
    }
  }

  async getBankBytes(bank, manifestUrl, signal) {
    const url = resolveSameOrigin(bank.url, manifestUrl, `Bank ${bank.id}`);
    const key = cacheKeyFor(url, bank);
    const cache = await this.openBankCache();
    if (cache) {
      let cached = null;
      try {
        cached = await withTimeout(cache.match(key), CACHE_OPERATION_TIMEOUT_MS, "Cache read");
      } catch (error) {
        this.metrics.cache.fallbacks += 1;
        this.metrics.cache.lastError = String(error?.message || error);
      }
      if (cached) {
        const integrityStartedAt = nowMs();
        try {
          const bytes = await withTimeout(cached.arrayBuffer(), CACHE_OPERATION_TIMEOUT_MS, "Cached bank read");
          await validateBankBytes(bank, bytes, this.options.cryptoImpl);
          this.metrics.cache.hits += 1;
          return { bytes, url, cacheHit: true, fetchMs: 0, integrityMs: nowMs() - integrityStartedAt };
        } catch (error) {
          this.metrics.cache.corruptions += 1;
          try { await withTimeout(cache.delete(key), CACHE_OPERATION_TIMEOUT_MS, "Cache corruption eviction"); }
          catch (deleteError) {
            this.metrics.cache.fallbacks += 1;
            this.metrics.cache.lastError = String(deleteError?.message || deleteError);
          }
        }
      }
    }

    let response;
    const fetchStartedAt = nowMs();
    try {
      response = await this.options.fetchImpl(url.href, { credentials: "same-origin", mode: "same-origin", signal });
    } catch (cause) {
      if (signal.aborted) throw engineError("STALE_OPERATION", "Bank request was superseded", cause);
      throw engineError("BANK_NETWORK", `Could not fetch SoundFont bank ${bank.id}`, cause);
    }
    if (!response.ok) throw engineError("BANK_HTTP", `SoundFont bank request failed: ${response.status}`);
    const fetchMs = nowMs() - fetchStartedAt;
    let cacheCandidate = null;
    if (cache && response.clone && cache.put) {
      try { cacheCandidate = response.clone(); }
      catch (error) {
        this.metrics.cache.fallbacks += 1;
        this.metrics.cache.lastError = String(error?.message || error);
      }
    }

    let bytes;
    const integrityStartedAt = nowMs();
    try {
      bytes = await response.arrayBuffer();
      await validateBankBytes(bank, bytes, this.options.cryptoImpl);
    } catch (error) {
      if (error instanceof EngineError) throw error;
      throw engineError("BANK_SIZE", `Could not read SoundFont bank ${bank.id}`, error);
    }
    if (cache && cacheCandidate) {
      try { await withTimeout(cache.put(key, cacheCandidate), CACHE_OPERATION_TIMEOUT_MS, "Cache write"); }
      catch (error) {
        this.metrics.cache.fallbacks += 1;
        this.metrics.cache.lastError = String(error?.message || error);
      }
    }
    return { bytes, url, cacheHit: false, fetchMs, integrityMs: nowMs() - integrityStartedAt };
  }

  loadBank(bankId = null, { bytes: suppliedBytes = null, transferOwnership = false } = {}) {
    if (this.disposed) return Promise.reject(engineError("ENGINE_DISPOSED", "Audio engine has been disposed"));
    if (this.metrics.processorError) return Promise.reject(engineError("PROCESSOR_ERROR", this.metrics.processorError));
    if (bankId !== null && (typeof bankId !== "string" || !bankId)) throw new TypeError("bankId must be a non-empty string when provided");
    if (this.bankPromise && this.bankPromiseId === bankId) return this.bankPromise;
    if (suppliedBytes !== null && !(suppliedBytes instanceof ArrayBuffer)) throw new TypeError("bytes must be an ArrayBuffer");
    if (typeof transferOwnership !== "boolean") throw new TypeError("transferOwnership must be a boolean");
    if (bankId !== null && this.currentBankId === bankId && this.state.bankIndexed) return Promise.resolve(this.getBankInventory());
    if (bankId === null && this.catalog && this.currentBankId === this.catalog.defaultBankId && this.state.bankIndexed) {
      return Promise.resolve(this.getBankInventory());
    }
    this.bankAbort?.abort();
    this.invalidatePendingPreparations();
    const controller = new AbortController();
    this.bankAbort = controller;
    const generation = ++this.bankGeneration;
    this.state = { ...this.state, lifecycle: "loading-bank", bankIndexed: false, preparedPatches: [] };
    const startedAt = nowMs();
    let promise;
    promise = (async () => {
      let selectedBankId = bankId;
      let targetNode = this.synthNode;
      let replacement = false;
      let oldNodeToDispose = null;
      try {
        const catalog = await this.getCatalog();
        this.assertCurrentBankRequest(generation, controller.signal);
        selectedBankId ??= catalog.defaultBankId;
        this.bankPromiseId = selectedBankId;
        if (this.currentBankId === selectedBankId && this.metrics.bank?.id === selectedBankId) {
          this.state = { ...this.state, lifecycle: this.state.preparedPatches.length ? "ready" : "bank-indexed", bankIndexed: true, bankId: selectedBankId };
          return this.getBankInventory();
        }
        const bank = catalog.banks.find((candidate) => candidate.id === selectedBankId);
        if (!bank) throw engineError("BANK_NOT_FOUND", `Unknown SoundFont bank: ${selectedBankId}`);
        const manifestUrl = this.options.catalogUrl;
        let fetched;
        if (suppliedBytes !== null) {
          const integrityStartedAt = nowMs();
          await validateBankBytes(bank, suppliedBytes, this.options.cryptoImpl);
          fetched = {
            bytes: transferOwnership ? suppliedBytes : suppliedBytes.slice(0),
            cacheHit: false,
            fetchMs: 0,
            integrityMs: nowMs() - integrityStartedAt,
          };
        } else {
          fetched = await this.getBankBytes(bank, manifestUrl, controller.signal);
        }
        this.assertCurrentBankRequest(generation, controller.signal);
        const parseStartedAt = nowMs();
        if (this.currentBankId && this.currentBankId !== selectedBankId) {
          await Promise.all([this.cancelGroup("file"), this.cancelGroup("live")]);
          this.assertCurrentBankRequest(generation, controller.signal);
          targetNode = await this.createReplacementSynthNode(generation, controller.signal);
          replacement = true;
        }
        const loaded = await this.requestWorker("load-bank", {
          bankId: selectedBankId,
          bytes: fetched.bytes,
          format: bank.format,
        }, [fetched.bytes], this.options.requestTimeoutMs, targetNode);
        this.assertCurrentBankRequest(generation, controller.signal);
        if (replacement) {
          let appliedEffects;
          do {
            appliedEffects = { ...this.metrics.effects };
            await this.requestWorker("set-effects", appliedEffects, [], this.options.requestTimeoutMs, targetNode);
            this.assertCurrentBankRequest(generation, controller.signal);
          } while (appliedEffects.enabled !== this.metrics.effects.enabled
            || appliedEffects.reverbGain !== this.metrics.effects.reverbGain
            || appliedEffects.chorusGain !== this.metrics.effects.chorusGain);
          oldNodeToDispose = this.synthNode;
          this.swapSynthNode(targetNode);
          replacement = false;
        }
        const parseMs = loaded.parseMs ?? (nowMs() - parseStartedAt);
        this.currentBankId = selectedBankId;
        this.presetList = loaded.presetList || [];
        this.preparedRequestKeys.clear();
        this.state = {
          ...this.state,
          lifecycle: "bank-indexed",
          bankIndexed: true,
          bankId: selectedBankId,
          preparedPatches: [],
        };
        this.metrics.bank = {
          id: selectedBankId,
          format: bank.format,
          bytes: bank.bytes,
          sha256: bank.sha256,
          cacheHit: fetched.cacheHit,
          fetchMs: fetched.fetchMs,
          integrityMs: fetched.integrityMs,
          parseMs,
          totalMs: nowMs() - startedAt,
          presetCount: this.presetList.length,
        };
        if (oldNodeToDispose) {
          const disposal = await this.disposeSynthNode(oldNodeToDispose);
          if (generation === this.bankGeneration && this.synthNode === targetNode) this.metrics.lastBankSwapDisposal = disposal;
          this.assertCurrentBankRequest(generation, controller.signal);
        }
        return this.getBankInventory();
      } catch (error) {
        if (generation !== this.bankGeneration || this.disposed) throw engineError("STALE_OPERATION", "Bank load was superseded or disposed", error);
        this.state = {
          ...this.state,
          lifecycle: this.metrics.processorError ? "error" : this.currentBankId ? "bank-indexed" : "error",
          bankIndexed: Boolean(this.currentBankId),
        };
        throw error;
      } finally {
        if (replacement && targetNode !== this.synthNode) await this.disposeAuxiliaryNode(targetNode);
        if (this.bankPromise === promise) {
          this.bankPromise = null;
          this.bankPromiseId = null;
        }
      }
    })();
    this.bankPromise = promise;
    this.bankPromiseId = bankId;
    return promise;
  }

  invalidatePendingPreparations() {
    const error = engineError("STALE_OPERATION", "Patch preparation was superseded by a bank load");
    for (const [requestId, request] of this.pendingRequests) {
      if (request.type === "prepare-patches") this.finishRequest(requestId, null, error);
    }
  }

  async createReplacementSynthNode(generation, signal) {
    await withTimeout(this.context.audioWorklet.addModule(this.options.synthWorkletUrl), this.options.initializationTimeoutMs, "Synth worklet load");
    this.assertCurrentBankRequest(generation, signal);
    const node = createSynthNode(this.context, this.options, this.epochs);
    this.replacementNodes.add(node);
    node.port.onmessage = (event) => this.handleSynthMessage(event.data, node);
    node.onprocessorerror = (event) => this.handleProcessorError(event, node);
    node.connect(this.gainNode);
    try {
      await withTimeout(this.requestWorker("initialize", {}, [], this.options.initializationTimeoutMs, node), this.options.initializationTimeoutMs, "Synth processor initialization");
      this.assertCurrentBankRequest(generation, signal);
      return node;
    } catch (error) {
      this.closeSynthNode(node);
      throw error;
    }
  }

  swapSynthNode(node) {
    this.synthNode = node;
    this.replacementNodes.delete(node);
    this.metrics.pendingEvents = 0;
    this.metrics.activeNotes = 0;
    this.metrics.voiceCount = 0;
  }

  closeSynthNode(node) {
    if (!node) return;
    this.replacementNodes.delete(node);
    node.port.onmessage = null;
    node.onprocessorerror = null;
    try { node.disconnect(); } catch { /* Already disconnected. */ }
    try { node.port.close(); } catch { /* Already closed. */ }
  }

  async disposeSynthNode(node) {
    let acknowledged = false;
    let reason = null;
    try {
      try { node.disconnect(); } catch { /* Already disconnected. */ }
      await this.requestWorker("dispose", {}, [], DISPOSE_TIMEOUT_MS, node);
      acknowledged = true;
    } catch (error) {
      reason = String(error?.message || error);
    } finally {
      this.closeSynthNode(node);
    }
    return { acknowledged, reason };
  }

  async disposeAuxiliaryNode(node) {
    if (!node) return;
    if (this.disposed) {
      this.closeSynthNode(node);
      return;
    }
    await this.disposeSynthNode(node);
  }

  assertCurrentBankRequest(generation, signal) {
    this.assertActive();
    if (signal.aborted || generation !== this.bankGeneration) {
      throw engineError("STALE_OPERATION", "Bank load was superseded");
    }
  }

  getBankInventory() {
    return {
      id: this.currentBankId,
      format: this.metrics.bank?.format,
      bytes: this.metrics.bank?.bytes,
      sha256: this.metrics.bank?.sha256,
      presets: this.presetList.map((preset) => ({ ...preset })),
    };
  }

  preparePatches(requests) {
    this.assertActive();
    if (!this.state.bankIndexed) throw engineError("BANK_NOT_INDEXED", "Load and index a bank before preparing patches");
    const bankGeneration = this.bankGeneration;
    const bankId = this.currentBankId;
    const normalized = validatePreparationRequests(requests);
    const keys = normalized.map(preparationKey);
    const pass = keys.every((key) => this.preparedRequestKeys.has(key)) ? "repeat-request" : "first-request";
    this.state = { ...this.state, lifecycle: "preparing-patches" };
    const startedAt = nowMs();
    const promise = this.requestWorker("prepare-patches", { requests: normalized });
    return promise.then((result) => {
      this.assertActive();
      if (bankGeneration !== this.bankGeneration || bankId !== this.currentBankId || !this.state.bankIndexed) {
        throw engineError("STALE_OPERATION", "Patch preparation completed for a superseded bank");
      }
      const elapsedMs = nowMs() - startedAt;
      for (const key of keys) {
        this.preparedRequestKeys.delete(key);
        this.preparedRequestKeys.add(key);
      }
      while (this.preparedRequestKeys.size > 256) {
        this.preparedRequestKeys.delete(this.preparedRequestKeys.values().next().value);
      }
      const entry = {
        bankId: this.currentBankId,
        preparationPass: pass,
        elapsedMs,
        workerElapsedMs: result.elapsedMs,
        requests: normalized.length,
        noteCount: normalized.reduce((total, request) => total + request.notes.length, 0),
        uniqueSampleCount: result.uniqueSampleCount,
        reusedSampleCount: result.reusedSampleCount,
      };
      this.metrics.preparations.push(entry);
      if (this.metrics.preparations.length > 64) this.metrics.preparations.shift();
      const prepared = new Set(this.state.preparedPatches);
      for (const key of keys) {
        prepared.delete(key);
        prepared.add(key);
      }
      while (prepared.size > 256) prepared.delete(prepared.values().next().value);
      this.state = {
        ...this.state,
        lifecycle: "ready",
        preparedPatches: [...prepared],
      };
      return { ...entry, patches: result.patches, exclusiveClasses: result.exclusiveClasses || [] };
    }).catch((error) => {
      if (!this.disposed && bankGeneration === this.bankGeneration && bankId === this.currentBankId && this.state.bankIndexed) {
        this.state = { ...this.state, lifecycle: this.state.preparedPatches.length ? "ready" : "bank-indexed" };
      }
      throw error;
    });
  }

  scheduleEvent(event) {
    this.assertActive();
    if (!this.state.bankIndexed) throw engineError("BANK_NOT_INDEXED", "Load a SoundFont bank before scheduling events");
    const normalized = validateEvent(event, this.context.currentTime, this.epochFor(event?.group));
    if (this.metrics.pendingEvents >= this.options.maxPendingEvents) throw engineError("QUEUE_FULL", "Audio event queue is full");
    normalized.sequence = ++this.eventSequence;
    this.metrics.eventsScheduled += 1;
    this.metrics.pendingEvents += 1;
    try {
      this.synthNode.port.postMessage({ type: "schedule-event", event: normalized });
    } catch (cause) {
      this.metrics.pendingEvents = Math.max(0, this.metrics.pendingEvents - 1);
      this.metrics.eventsRejected += 1;
      throw engineError("PROCESSOR_ERROR", "Could not queue MIDI event", cause);
    }
    return normalized.sequence;
  }

  schedulePhrase({ group = "file", channel = 0, epoch = this.epochFor(group), notes }) {
    assertGroup(group);
    assertInt(channel, "channel", 0, 15);
    if (!Array.isArray(notes)) throw new TypeError("notes must be an array");
    const prepared = notes.map((note, index) => {
      const startAt = note?.startAt;
      const durationSeconds = note?.durationSeconds;
      if (!Number.isFinite(startAt) || startAt < 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        throw new RangeError("Phrase notes need AudioContext startAt and a positive durationSeconds");
      }
      return {
        group,
        epoch,
        channel: note.channel ?? channel,
        lane: note.lane ?? 0,
        pitch: note.pitch,
        velocity: note.velocity ?? 90,
        noteId: note.noteId ?? `${group}-${++this.eventSequence}-${index}`,
        startAt,
        durationSeconds,
      };
    });
    const normalized = [];
    for (const note of prepared) {
      normalized.push(validateEvent({ ...note, type: "noteOn", at: note.startAt }, this.context.currentTime, epoch));
      normalized.push(validateEvent({ ...note, type: "noteOff", at: note.startAt + note.durationSeconds }, this.context.currentTime, epoch));
    }
    if (this.metrics.pendingEvents + normalized.length > this.options.maxPendingEvents) throw engineError("QUEUE_FULL", "Audio event queue limit would be exceeded");
    return normalized.map((event) => this.postNormalizedEvent(event));
  }

  postNormalizedEvent(event) {
    event.sequence = ++this.eventSequence;
    this.metrics.eventsScheduled += 1;
    this.metrics.pendingEvents += 1;
    this.synthNode.port.postMessage({ type: "schedule-event", event });
    return event.sequence;
  }

  epochFor(group) {
    assertGroup(group);
    return this.epochs[group];
  }

  cancelGroup(group, { fromTime = this.context.currentTime } = {}) {
    this.assertActive();
    assertGroup(group);
    if (!Number.isFinite(fromTime) || fromTime < 0) throw new RangeError("fromTime must be a non-negative AudioContext time");
    const at = Math.max(fromTime, this.context.currentTime);
    const epoch = ++this.epochs[group];
    const activeNode = this.synthNode;
    const activeRequest = this.requestWorker("cancel-group", { group, epoch, at }, [], this.options.requestTimeoutMs, activeNode);
    const candidateRequests = [...this.replacementNodes]
      .filter((node) => node !== activeNode)
      .map((node) => this.requestWorker("cancel-group", { group, epoch, at }, [], Math.min(3000, this.options.requestTimeoutMs), node).catch(() => null));
    return Promise.all([activeRequest, ...candidateRequests]).then(([result]) => ({ ...result, epoch }));
  }

  cancelAll(options) {
    return Promise.all([this.cancelGroup("file", options), this.cancelGroup("live", options)]);
  }

  setMasterGain(value) {
    this.assertActive();
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("master gain must be from 0 to 1");
    this.gainNode.gain.setTargetAtTime(value, this.context.currentTime, 0.015);
    this.metrics.masterGain = value;
  }

  setEffects(settings = {}) {
    this.assertActive();
    const normalized = {
      enabled: settings.enabled === true,
      reverbGain: settings.reverbGain ?? 0.65,
      chorusGain: settings.chorusGain ?? 0.2,
    };
    for (const name of ["reverbGain", "chorusGain"]) {
      if (!Number.isFinite(normalized[name]) || normalized[name] < 0 || normalized[name] > 1) {
        throw new RangeError(`${name} must be from 0 to 1`);
      }
    }
    return this.requestWorker("set-effects", normalized).then((result) => {
      this.metrics.effects = { ...normalized };
      return result;
    });
  }

  async ensurePcmTap() {
    this.assertActive();
    if (this.tapNode) return this.tapNode;
    if (this.tapLoadPromise) return this.tapLoadPromise;
    const promise = (async () => {
      await withTimeout(this.context.audioWorklet.addModule(this.options.pcmWorkletUrl), this.options.initializationTimeoutMs, "PCM worklet load");
      this.assertActive();
      const tap = new AudioWorkletNode(this.context, "sf01-pcm-tap", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { maxCaptureFrames: Math.ceil(this.context.sampleRate * MAX_CAPTURE_SECONDS) },
      });
      tap.port.onmessage = (event) => this.handleTapMessage(event.data);
      tap.onprocessorerror = (event) => this.handleTapProcessorError(event);
      this.gainNode.disconnect();
      this.gainNode.connect(tap);
      tap.connect(this.context.destination);
      this.tapNode = tap;
      this.metrics.pcmTapEnabled = true;
      return tap;
    })().finally(() => {
      this.tapLoadPromise = null;
    });
    this.tapLoadPromise = promise;
    return promise;
  }

  async capturePcm({ durationSeconds = 1, timeoutMs = 15000 } = {}) {
    this.assertActive();
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > MAX_CAPTURE_SECONDS) {
      throw new RangeError(`durationSeconds must be greater than 0 and at most ${MAX_CAPTURE_SECONDS}`);
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60000) throw new RangeError("timeoutMs must be from 1 to 60000");
    const tap = await this.ensurePcmTap();
    this.assertActive();
    const requestId = ++this.requestSequence;
    const frames = Math.ceil(durationSeconds * this.context.sampleRate);
    const promise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.captureRequests.delete(requestId);
        reject(engineError("PCM_CAPTURE_TIMEOUT", "PCM capture timed out; ensure the AudioContext is running"));
      }, timeoutMs);
      this.captureRequests.set(requestId, { resolve, reject, timeoutId });
    });
    try {
      tap.port.postMessage({ type: "capture", requestId, frames });
    } catch (cause) {
      const request = this.captureRequests.get(requestId);
      if (request) clearTimeout(request.timeoutId);
      this.captureRequests.delete(requestId);
      throw engineError("PCM_CAPTURE", "Could not arm PCM capture", cause);
    }
    return promise;
  }

  getState() {
    return {
      ...this.state,
      preparedPatches: [...this.state.preparedPatches],
    };
  }

  getMetrics() {
    return {
      ...this.metrics,
      cache: { ...this.metrics.cache },
      bank: this.metrics.bank ? { ...this.metrics.bank } : null,
      preparations: this.metrics.preparations.map((entry) => ({ ...entry })),
      timingSamples: this.metrics.timingSamples.map((entry) => ({ ...entry })),
      epochs: { ...this.epochs },
    };
  }

  async dispose() {
    if (this.disposePromise) return this.disposePromise;
    if (this.disposed) return { acknowledged: false, reason: "already disposed" };
    this.disposed = true;
    this.state = { ...this.state, lifecycle: "disposed", disposed: true };
    this.bankGeneration += 1;
    this.bankAbort?.abort();
    this.failAllRequests(engineError("ENGINE_DISPOSED", "Audio engine has been disposed"));
    this.disposePromise = new Promise((resolve) => {
      let timer;
      let settled = false;
      this.disposeRequestId = ++this.requestSequence;
      const finish = (acknowledged, reason = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.resolveDisposeAck = null;
        this.disposeRequestId = null;
        this.synthNode.port.onmessage = null;
        this.synthNode.onprocessorerror = null;
        try { this.synthNode.disconnect(); } catch { /* Already disconnected. */ }
        if (this.tapNode) {
          this.tapNode.port.onmessage = null;
          this.tapNode.onprocessorerror = null;
          try { this.tapNode.disconnect(); } catch { /* Already disconnected. */ }
          try { this.tapNode.port.close(); } catch { /* Already closed. */ }
        }
        for (const node of [...this.replacementNodes]) this.closeSynthNode(node);
        try { this.synthNode.port.close(); } catch { /* Already closed. */ }
        try { this.gainNode.disconnect(); } catch { /* Already disconnected. */ }
        if (this.registration.current === this) {
          this.registration.current = null;
          contexts.delete(this.context);
        }
        resolve({ acknowledged, reason });
      };
      this.resolveDisposeAck = finish;
      timer = setTimeout(() => finish(false, "timeout"), DISPOSE_TIMEOUT_MS);
      try {
        this.synthNode.port.postMessage({ type: "dispose", requestId: this.disposeRequestId });
      } catch (error) {
        finish(false, String(error?.message || error));
      }
    });
    return this.disposePromise;
  }
}

function validatePreparationRequests(requests) {
  if (!Array.isArray(requests) || requests.length < 1 || requests.length > 256) {
    throw new RangeError("preparePatches requires 1 to 256 patch requests");
  }
  let noteCount = 0;
  return requests.map((request) => {
    assertInt(request?.bankMSB ?? 0, "bankMSB", 0, 127);
    assertInt(request?.bankLSB ?? 0, "bankLSB", 0, 127);
    assertInt(request?.program, "program", 0, 127);
    if (request.isDrum !== undefined && typeof request.isDrum !== "boolean") throw new TypeError("isDrum must be a boolean");
    if (!Array.isArray(request.notes) || request.notes.length < 1) throw new TypeError("Each patch request needs at least one note");
    noteCount += request.notes.length;
    if (noteCount > 4096) throw new RangeError("preparePatches is limited to 4096 note/velocity pairs");
    const notes = request.notes.map((note) => {
      assertInt(note.pitch, "pitch", 0, 127);
      assertInt(note.velocity, "velocity", 1, 127);
      return { pitch: note.pitch, velocity: note.velocity };
    });
    return {
      bankMSB: request.bankMSB ?? 0,
      bankLSB: request.bankLSB ?? 0,
      program: request.program,
      isDrum: request.isDrum ?? false,
      notes,
    };
  });
}

function preparationKey(request) {
  const notes = request.notes.map(({ pitch, velocity }) => `${pitch}:${velocity}`).join(",");
  return `${request.bankMSB}:${request.bankLSB}:${request.program}:${request.isDrum ? 1 : 0}:${notes}`;
}

function validateEvent(event, now, defaultEpoch) {
  if (!event || typeof event !== "object") throw new TypeError("event must be an object");
  assertGroup(event.group);
  if (!EVENT_TYPES.has(event.type)) throw new TypeError(`Unsupported MIDI event: ${event.type}`);
  assertInt(event.channel, "channel", 0, 15);
  if (!Number.isFinite(event.at) || event.at < 0) throw new RangeError("at must be a non-negative AudioContext time");
  if (event.at < now - 0.25) throw new RangeError("at cannot be more than 250 ms in the past");
  const normalized = { ...event, epoch: event.epoch ?? defaultEpoch };
  if (!Number.isInteger(normalized.epoch) || normalized.epoch < 0) throw new RangeError("epoch must be a non-negative integer");
  if (event.type === "noteOn" || event.type === "noteOff") {
    assertInt(event.pitch, "pitch", 0, 127);
    if (event.type === "noteOn") assertInt(event.velocity, "velocity", 1, 127);
    if (typeof event.noteId !== "string" || !event.noteId.length) throw new TypeError(`${event.type} requires a non-empty noteId`);
    if (event.lane !== undefined) {
      assertInt(event.lane, "lane", 0, 3);
      if (event.group !== "file" && event.lane !== 0) throw new RangeError("Only file-group events support overflow lanes");
    }
  } else if (event.type === "programChange") {
    assertInt(event.program, "program", 0, 127);
    if (event.bankMSB !== undefined) assertInt(event.bankMSB, "bankMSB", 0, 127);
    if (event.bankLSB !== undefined) assertInt(event.bankLSB, "bankLSB", 0, 127);
    if (event.isDrum !== undefined && typeof event.isDrum !== "boolean") throw new TypeError("isDrum must be a boolean");
  } else if (event.type === "cc") {
    assertInt(event.controller, "controller", 0, 127);
    assertInt(event.value, "value", 0, 127);
  } else if (event.type === "pitchWheel") assertInt(event.value, "pitchWheel value", 0, 16383);
  else if (event.type === "channelPressure") assertInt(event.value, "channel pressure", 0, 127);
  else if (event.type === "polyPressure") {
    assertInt(event.pitch, "pitch", 0, 127);
    assertInt(event.value, "poly pressure", 0, 127);
  }
  return normalized;
}

export async function getSoundfontCatalog({
  catalogUrl = new URL("./soundfont-manifest.json", import.meta.url),
  fetchImpl = globalThis.fetch,
} = {}) {
  const url = new URL(catalogUrl, import.meta.url);
  resolveSameOriginUrl(url.href, url, "Manifest");
  if (typeof fetchImpl !== "function") throw engineError("CATALOG_NETWORK", "Fetch is unavailable");
  let response;
  try {
    response = await fetchImpl(url.href, { credentials: "same-origin", mode: "same-origin" });
  } catch (cause) {
    throw engineError("CATALOG_NETWORK", "Could not fetch the SoundFont manifest", cause);
  }
  if (!response.ok) throw engineError("CATALOG_HTTP", `SoundFont manifest request failed: ${response.status}`);
  try {
    return validateCatalog(await response.json());
  } catch (cause) {
    if (cause instanceof EngineError) throw cause;
    throw engineError("CATALOG_MANIFEST", "SoundFont manifest is invalid", cause);
  }
}

export function createPlaybackAudioEngine(context, options = {}) {
  if (!context?.audioWorklet || !context.createGain) return Promise.reject(new TypeError("A live AudioContext with AudioWorklet support is required"));
  const existing = contexts.get(context);
  if (existing?.promise) return existing.promise;

  const catalogUrl = new URL(options.catalogUrl ?? "./soundfont-manifest.json", import.meta.url);
  const synthWorkletUrl = new URL(options.synthWorkletUrl ?? "./sf01-synth-worklet.js", import.meta.url);
  const pcmWorkletUrl = new URL(options.pcmWorkletUrl ?? "./sf01-pcm-tap.js", import.meta.url);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  const cacheStorage = Object.prototype.hasOwnProperty.call(options, "cacheStorage") ? options.cacheStorage : globalThis.caches;
  const cryptoImpl = options.cryptoImpl ?? globalThis.crypto;
  const normalizedOptions = {
    ...options,
    catalogUrl,
    synthWorkletUrl,
    pcmWorkletUrl,
    fetchImpl,
    cacheStorage,
    cryptoImpl,
    cacheName: options.cacheName ?? BANK_CACHE_NAME,
    initializationTimeoutMs: options.initializationTimeoutMs ?? 15000,
    requestTimeoutMs: options.requestTimeoutMs ?? 120000,
    maxPendingEvents: options.maxPendingEvents ?? MAX_PENDING_EVENTS,
  };
  if (typeof fetchImpl !== "function") return Promise.reject(new TypeError("fetchImpl must be a function"));
  if (!Number.isFinite(normalizedOptions.initializationTimeoutMs) || normalizedOptions.initializationTimeoutMs <= 0) return Promise.reject(new RangeError("initializationTimeoutMs must be positive"));
  if (!Number.isFinite(normalizedOptions.requestTimeoutMs) || normalizedOptions.requestTimeoutMs <= 0) return Promise.reject(new RangeError("requestTimeoutMs must be positive"));
  if (!Number.isInteger(normalizedOptions.maxPendingEvents) || normalizedOptions.maxPendingEvents < 1 || normalizedOptions.maxPendingEvents > MAX_PENDING_EVENTS) return Promise.reject(new RangeError(`maxPendingEvents must be from 1 to ${MAX_PENDING_EVENTS}`));
  try {
    resolveSameOrigin(catalogUrl.href, catalogUrl, "Manifest");
    resolveSameOriginUrl(synthWorkletUrl.href, catalogUrl, "Synth worklet");
    resolveSameOriginUrl(pcmWorkletUrl.href, catalogUrl, "PCM tap worklet");
    if (options.catalog) normalizedOptions.catalog = validateCatalog(options.catalog);
  } catch (error) {
    return Promise.reject(error);
  }
  const initialGain = options.masterGain ?? 0.16;
  if (!Number.isFinite(initialGain) || initialGain < 0 || initialGain > 1) return Promise.reject(new RangeError("masterGain must be from 0 to 1"));

  const registration = { promise: null, current: null };
  const promise = createEngineInstance(context, normalizedOptions, registration).then((engine) => {
    registration.current = engine;
    return engine;
  }).catch((error) => {
    if (contexts.get(context) === registration) contexts.delete(context);
    throw error;
  });
  registration.promise = promise;
  contexts.set(context, registration);
  return promise;
}

async function createEngineInstance(context, options, registration) {
  const createdAt = nowMs();
  const initialGain = options.masterGain ?? 0.16;
  let synthNode = null;
  let gainNode = null;
  let engine = null;
  const metrics = {
    createdAt,
    engineReadyAt: null,
    initializationMs: null,
    engineReady: false,
    bank: null,
    cache: { hits: 0, corruptions: 0, fallbacks: 0, disabled: 0, lastError: null },
    preparations: [],
    masterGain: initialGain,
    effects: { enabled: false, reverbGain: 0.65, chorusGain: 0.2 },
    eventsScheduled: 0,
    eventsApplied: 0,
    eventsRejected: 0,
    staleEventsDropped: 0,
    cancelledEvents: 0,
    cancelCount: 0,
    pendingEvents: 0,
    activeNotes: 0,
    voiceCount: 0,
    channelCount: 0,
    deferredNoteOffs: 0,
    staleNoteOffsSuppressed: 0,
    timingSamples: [],
    maxClockSkewSeconds: 0,
    processorError: null,
    pcmTapEnabled: false,
  };
  try {
    await withTimeout(context.audioWorklet.addModule(options.synthWorkletUrl), options.initializationTimeoutMs, "Synth worklet load");
    synthNode = createSynthNode(context, options, { file: 0, live: 0 });
    gainNode = context.createGain();
    gainNode.gain.value = initialGain;
    synthNode.connect(gainNode);
    gainNode.connect(context.destination);
    engine = new PlaybackAudioEngine(context, options, synthNode, gainNode, metrics, registration);
    const readyPromise = engine.requestWorker("initialize", {}, [], options.initializationTimeoutMs);
    engine.initializationPromise = withTimeout(readyPromise, options.initializationTimeoutMs, "Synth processor initialization").then(() => undefined);
    await engine.initializationPromise;
  } catch (error) {
    if (engine) engine.failAllRequests(error);
    if (synthNode) {
      synthNode.port.onmessage = null;
      synthNode.onprocessorerror = null;
      try { synthNode.disconnect(); } catch { /* Failed initialization cleanup. */ }
      try { synthNode.port.close(); } catch { /* Failed initialization cleanup. */ }
    }
    if (gainNode) try { gainNode.disconnect(); } catch { /* Failed initialization cleanup. */ }
    throw error;
  }
  return engine;
}

function createSynthNode(context, options, epochs) {
  return new AudioWorkletNode(context, "sf01-synth", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: { maxPendingEvents: options.maxPendingEvents, epochs: { ...epochs } },
  });
}
