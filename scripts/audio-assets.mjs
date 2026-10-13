import { createHash } from "node:crypto";

const HEADER_BYTES = 38;

function fail(message) {
  throw new Error(`SF-01 asset validation: ${message}`);
}

function safeRelativePath(value, label) {
  if (typeof value !== "string" || !value || value.startsWith("/") || value.includes("\\") || /^[a-z]+:/i.test(value)) {
    fail(`${label} must be a relative asset path`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes(":"))) {
    fail(`${label} contains an unsafe path segment`);
  }
  return value;
}

function bytesView(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  fail(`${label} is not a byte array`);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readChunks(bytes, start, end, label) {
  const chunks = [];
  let offset = start;
  while (offset < end) {
    if (offset + 8 > end) fail(`${label} has a truncated RIFF chunk header`);
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > end) fail(`${label} RIFF chunk ${id} exceeds its parent`);
    chunks.push({ id, dataStart, dataEnd, size });
    offset = dataEnd + (size & 1);
  }
  if (offset !== end) fail(`${label} has malformed RIFF padding`);
  return chunks;
}

export function parseSoundFontPresetHeaders(input) {
  const bytes = bytesView(input, "SoundFont");
  if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "sfbk") {
    fail("bank does not have RIFF/sfbk magic");
  }
  const riffEnd = bytes.readUInt32LE(4) + 8;
  if (riffEnd !== bytes.length) fail("RIFF length does not match the SoundFont file size");
  const topLevel = readChunks(bytes, 12, riffEnd, "SoundFont");
  let headers = null;
  for (const chunk of topLevel) {
    if (chunk.id !== "LIST" || chunk.size < 4 || bytes.toString("ascii", chunk.dataStart, chunk.dataStart + 4) !== "pdta") continue;
    const pdtaChunks = readChunks(bytes, chunk.dataStart + 4, chunk.dataEnd, "pdta");
    for (const pdtaChunk of pdtaChunks) {
      if (pdtaChunk.id !== "phdr") continue;
      if (headers) fail("SoundFont has more than one pdta/phdr table");
      if (pdtaChunk.size < HEADER_BYTES || pdtaChunk.size % HEADER_BYTES !== 0) fail("phdr has an invalid record size");
      headers = [];
      for (let offset = pdtaChunk.dataStart; offset < pdtaChunk.dataEnd; offset += HEADER_BYTES) {
        const rawName = bytes.toString("latin1", offset, offset + 20);
        const name = rawName.split("\0", 1)[0].trimEnd();
        headers.push({ name, program: bytes.readUInt16LE(offset + 20), soundfontBank: bytes.readUInt16LE(offset + 22) });
      }
    }
  }
  if (!headers || headers.length < 2) fail("SoundFont is missing an active pdta/phdr table and terminal row");
  return headers;
}

function validateCatalog(bank, catalog, activeHeaders) {
  if (!catalog || catalog.schemaVersion !== 1 || catalog.bankId !== bank.id || !Array.isArray(catalog.presets)) {
    fail(`preset catalog does not match bank ${bank.id}`);
  }
  const signature = ({ name, program, soundfontBank }) => `${soundfontBank}\u0000${program}\u0000${name}`;
  const actualCounts = new Map();
  for (const header of activeHeaders) {
    const key = signature(header);
    actualCounts.set(key, (actualCounts.get(key) || 0) + 1);
  }
  const catalogCounts = new Map();
  for (const preset of catalog.presets) {
    if (!preset || !Number.isInteger(preset.soundfontBank) || preset.soundfontBank < 0 || preset.soundfontBank > 65535
        || !Number.isInteger(preset.program) || preset.program < 0 || preset.program > 127
        || typeof preset.name !== "string" || !preset.name || typeof preset.isDrum !== "boolean") {
      fail(`preset catalog ${bank.inventory.catalogPath} has an invalid row`);
    }
    const key = signature(preset);
    catalogCounts.set(key, (catalogCounts.get(key) || 0) + 1);
  }
  if (actualCounts.size !== catalogCounts.size || [...actualCounts].some(([key, count]) => catalogCounts.get(key) !== count)) {
    fail(`preset catalog ${bank.inventory.catalogPath} does not match binary phdr bank/program/name rows`);
  }

  const gmPrograms = new Set(activeHeaders.filter((header) => header.soundfontBank === 0).map((header) => header.program));
  if (gmPrograms.size !== 128 || Array.from({ length: 128 }, (_, program) => program).some((program) => !gmPrograms.has(program))) {
    fail(`bank ${bank.id} binary phdr does not contain GM bank-0 programs 0 through 127`);
  }
  const inventory = bank.inventory || {};
  const counts = {
    activePresetHeaders: activeHeaders.length,
    gmBank0Programs: gmPrograms.size,
    instrumentPresets: activeHeaders.filter((header) => header.soundfontBank !== 120 && header.soundfontBank !== 128).length,
    drumKitPresetsBank128: activeHeaders.filter((header) => header.soundfontBank === 128).length,
    drumKitAliasesBank120: activeHeaders.filter((header) => header.soundfontBank === 120).length,
  };
  for (const [name, value] of Object.entries(counts)) {
    if (Number.isInteger(inventory[name]) && inventory[name] !== value) fail(`bank ${bank.id} inventory count ${name} disagrees with binary phdr`);
    if (Number.isInteger(catalog.counts?.[name]) && catalog.counts[name] !== value) fail(`catalog ${bank.id} count ${name} disagrees with binary phdr`);
  }
  if (catalog.presets.length !== activeHeaders.length || (Number.isInteger(inventory.activePresetHeaders) && inventory.activePresetHeaders !== activeHeaders.length)) {
    fail(`bank ${bank.id} active preset count disagrees with binary phdr`);
  }
}

export function validateSoundfontManifest(manifest, readAsset) {
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.banks) || !manifest.banks.length) {
    fail("manifest must use schemaVersion 1 and contain banks");
  }
  if (typeof readAsset !== "function") fail("readAsset must be a function");
  const bankIds = new Set();
  const copiedPaths = new Set();
  for (const bank of manifest.banks) {
    if (!bank || typeof bank.id !== "string" || !bank.id || bankIds.has(bank.id)) fail("manifest contains a missing or duplicate bank ID");
    bankIds.add(bank.id);
    if (!bank.name || !["SF2", "SF3"].includes(bank.format)) fail(`bank ${bank.id} has unsupported format metadata`);
    const filePath = safeRelativePath(bank.filename, `bank ${bank.id} filename`);
    const urlPath = safeRelativePath(bank.url, `bank ${bank.id} URL`);
    if (filePath !== urlPath || !filePath.toLowerCase().endsWith(`.${bank.format.toLowerCase()}`)) fail(`bank ${bank.id} filename, URL, and format disagree`);
    if (!Number.isSafeInteger(bank.bytes) || bank.bytes < 12 || !/^[a-f0-9]{64}$/i.test(bank.sha256 || "")) fail(`bank ${bank.id} has invalid byte/hash metadata`);
    const bankBytes = bytesView(readAsset(filePath), `bank ${bank.id}`);
    if (bankBytes.length !== bank.bytes) fail(`bank ${bank.id} byte count mismatch`);
    if (bankBytes.toString("ascii", 0, 4) !== "RIFF" || bankBytes.toString("ascii", 8, 12) !== "sfbk") fail(`bank ${bank.id} is not RIFF/sfbk`);
    if (digest(bankBytes).toLowerCase() !== bank.sha256.toLowerCase()) fail(`bank ${bank.id} SHA-256 mismatch`);
    if (bank.stableId && bank.stableId.toLowerCase() !== `sha256:${bank.sha256.toLowerCase()}`) fail(`bank ${bank.id} stableId disagrees with SHA-256`);
    copiedPaths.add(filePath);

    const inventory = bank.inventory;
    const catalogPath = safeRelativePath(inventory?.catalogPath, `bank ${bank.id} preset catalog`);
    if (!Number.isSafeInteger(inventory?.catalogBytes) || !/^[a-f0-9]{64}$/i.test(inventory?.catalogSha256 || "")) fail(`bank ${bank.id} catalog hash metadata is required`);
    const catalogBytes = bytesView(readAsset(catalogPath), `catalog ${bank.id}`);
    if (catalogBytes.length !== inventory.catalogBytes) fail(`bank ${bank.id} catalog byte count mismatch`);
    if (digest(catalogBytes).toLowerCase() !== inventory.catalogSha256.toLowerCase()) fail(`bank ${bank.id} catalog SHA-256 mismatch`);
    let catalog;
    try { catalog = JSON.parse(catalogBytes.toString("utf8")); }
    catch (error) { fail(`bank ${bank.id} catalog is invalid JSON: ${error.message}`); }
    const headers = parseSoundFontPresetHeaders(bankBytes);
    const terminal = headers.at(-1);
    if (typeof inventory.terminalRecordName === "string") {
      if (terminal.name !== inventory.terminalRecordName) fail(`bank ${bank.id} terminal phdr name disagrees with inventory`);
    } else if (inventory.terminalRecordBlank === true) {
      if (terminal.name !== "") fail(`bank ${bank.id} expected a blank terminal phdr row`);
    } else fail(`bank ${bank.id} terminal phdr record expectation is missing`);
    validateCatalog(bank, catalog, headers.slice(0, -1));
    copiedPaths.add(catalogPath);

    if (!bank.license || typeof bank.license.name !== "string" || !bank.license.name) fail(`bank ${bank.id} license metadata is missing`);
    const licensePath = safeRelativePath(bank.license.path, `bank ${bank.id} license`);
    if (!Array.isArray(bank.noticeFiles) || !bank.noticeFiles.includes(licensePath)) fail(`bank ${bank.id} noticeFiles must include its license`);
    if (bank.deliveryNotice?.path && !bank.noticeFiles.includes(bank.deliveryNotice.path)) fail(`bank ${bank.id} noticeFiles must include its delivery notice`);
    const noticeMetadata = new Map([[licensePath, bank.license]]);
    for (const item of bank.attributionFiles || []) {
      if (!item || typeof item.path !== "string") fail(`bank ${bank.id} has invalid attribution metadata`);
      noticeMetadata.set(item.path, item);
    }
    if (bank.deliveryNotice?.path) noticeMetadata.set(bank.deliveryNotice.path, bank.deliveryNotice);
    for (const rawPath of bank.noticeFiles) {
      const noticePath = safeRelativePath(rawPath, `bank ${bank.id} notice`);
      const metadata = noticeMetadata.get(noticePath);
      if (!metadata || !Number.isSafeInteger(metadata.bytes) || !/^[a-f0-9]{64}$/i.test(metadata.sha256 || "")) fail(`notice ${noticePath} has no byte/hash metadata`);
      const noticeBytes = bytesView(readAsset(noticePath), `notice ${noticePath}`);
      if (noticeBytes.length !== metadata.bytes || digest(noticeBytes).toLowerCase() !== metadata.sha256.toLowerCase()) fail(`notice ${noticePath} byte count or SHA-256 mismatch`);
      copiedPaths.add(noticePath);
    }
  }
  if (typeof manifest.defaultBankId !== "string" || !bankIds.has(manifest.defaultBankId)) fail("defaultBankId does not identify a delivered bank");
  return { copiedPaths };
}
