// Reads an MP4/MOV duration from the container header (moov/mvhd) using ranged reads, so the server
// never trusts a browser-reported length and never downloads the whole video.
// NOTE: this is the container-declared duration, not an authenticated playback measurement.
// Any truncated, overflowing, unsupported or implausible header returns null (= unverified, rejected).

export const SOURCE_MAX_SECONDS = 30;
/** Container/frame rounding allowance: a "30 s" export is often 30.02 s. Anything above is rejected. (Policy pending captain decision.) */
export const SOURCE_TOLERANCE_SECONDS = 0.05;
export const MAX_PLAUSIBLE_SECONDS = 24 * 3600;

export function isSourceTooLong(seconds: number): boolean {
  return seconds > SOURCE_MAX_SECONDS + SOURCE_TOLERANCE_SECONDS;
}

export type RangeReader = (offset: number, length: number) => Promise<Uint8Array>;

const MAX_MOOV_BYTES = 64 * 1024 * 1024;

function u32(b: Uint8Array, o: number) { return ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]; }
function u64(b: Uint8Array, o: number): number | null {
  const v = u32(b, o) * 2 ** 32 + u32(b, o + 4);
  return Number.isSafeInteger(v) ? v : null;
}
function type(b: Uint8Array, o: number) { return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]); }

/** Parse mvhd inside a moov payload → seconds, or null. */
export function durationFromMoov(moov: Uint8Array): number | null {
  let o = 0;
  for (let i = 0; i < 4096 && o + 8 <= moov.length; i++) {
    let size: number | null = u32(moov, o);
    const t = type(moov, o + 4);
    let hdr = 8;
    if (size === 1) { if (o + 16 > moov.length) return null; size = u64(moov, o + 8); hdr = 16; }
    else if (size === 0) size = moov.length - o;
    if (size == null || size < hdr || o + size > moov.length) return null;
    if (t === "mvhd") {
      const p = o + hdr;
      const version = moov[p];
      if (version !== 0 && version !== 1) return null;
      const need = version === 1 ? 32 : 20;
      if (p + need > o + size) return null;
      const timescale = version === 1 ? u32(moov, p + 20) : u32(moov, p + 12);
      const duration = version === 1 ? u64(moov, p + 24) : u32(moov, p + 16);
      if (!timescale || duration == null || duration <= 0) return null;
      if (version === 0 && duration === 0xffffffff) return null; // "unknown" duration
      const s = duration / timescale;
      return Number.isFinite(s) && s > 0 && s <= MAX_PLAUSIBLE_SECONDS ? s : null;
    }
    o += size;
  }
  return null;
}

/** Walk top-level boxes of a file of `fileSize` bytes; returns seconds or null when unreadable. */
export async function readMp4Duration(read: RangeReader, fileSize: number): Promise<number | null> {
  if (!Number.isSafeInteger(fileSize) || fileSize < 16) return null;
  let o = 0;
  for (let i = 0; i < 64 && o + 8 <= fileSize; i++) {
    const h = await read(o, Math.min(16, fileSize - o));
    if (h.length < 8) return null;
    let size: number | null = u32(h, 0);
    const t = type(h, 4);
    let hdr = 8;
    if (size === 1) { if (h.length < 16) return null; size = u64(h, 8); hdr = 16; }
    else if (size === 0) size = fileSize - o;
    if (size == null || size < hdr || o + size > fileSize) return null;
    if (t === "moov") {
      if (size > MAX_MOOV_BYTES) return null;
      const body = await read(o + hdr, size - hdr);
      if (body.length !== size - hdr) return null;
      return durationFromMoov(body);
    }
    o += size;
  }
  return null;
}

export const RANGE_TIMEOUT_MS = 10_000;

/** Exact ranged read: must be 206 with a matching Content-Range and byte count, else throws (→ unverified). */
export async function exactRange(url: string, offset: number, length: number, total: number, fetchImpl: typeof fetch = fetch): Promise<Uint8Array> {
  const end = Math.min(total - 1, offset + length - 1);
  const r = await fetchImpl(url, { headers: { Range: `bytes=${offset}-${end}` }, signal: AbortSignal.timeout(RANGE_TIMEOUT_MS) });
  if (r.status !== 206) { await r.body?.cancel(); throw new Error("range_unsupported"); }
  if ((r.headers.get("content-range") ?? "") !== `bytes ${offset}-${end}/${total}`) { await r.body?.cancel(); throw new Error("range_mismatch"); }
  const b = new Uint8Array(await r.arrayBuffer());
  if (b.length !== end - offset + 1) throw new Error("range_length");
  return b;
}


export type SourceStatus = "measured_ok" | "measured_too_long" | "unknown_duration" | "rejected_media";

/** True when the first box is an ISO-BMFF ftyp (MP4/MOV family). */
export function hasFtyp(head: Uint8Array): boolean {
  return head.length >= 8 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70;
}

/** @deprecated legacy classifier kept for older callers/tests; verifySourceVideo uses probeMp4 + classifyProbe. */
export function classifySource(head: Uint8Array, seconds: number | null): { status: SourceStatus } {
  if (!hasFtyp(head)) return { status: "rejected_media" };
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return { status: "unknown_duration" };
  return { status: isSourceTooLong(seconds) ? "measured_too_long" : "measured_ok" };
}

// ---------- Typed probe (post-review): malformed ≠ unknown ≠ io failure ----------

export type Probe =
  | { kind: "measured"; seconds: number }
  | { kind: "unknown_declared" }
  | { kind: "malformed"; reason: string }
  | { kind: "io_error"; reason: string };

export const PROBE_MAX_TOP_BOXES = 64;
export const PROBE_MAX_READ_BYTES = 2 * 1024 * 1024;
const BRANDS = new Set(["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "mp71", "avc1", "hvc1", "hev1", "qt  ", "M4V ", "M4VH", "M4VP", "3gp4", "3gp5", "3gp6", "3g2a", "dash", "msnv", "f4v ", "XAVC", "MSNV"]);

class IoError extends Error {}

/** Parse mvhd in a moov payload (possibly a budget-bounded prefix of it). */
export function probeMoov(moov: Uint8Array, complete: boolean): Probe {
  let o = 0;
  for (let i = 0; i < 4096 && o + 8 <= moov.length; i++) {
    let size: number | null = u32(moov, o);
    const t = type(moov, o + 4);
    let hdr = 8;
    if (size === 1) { if (o + 16 > moov.length) break; size = u64(moov, o + 8); hdr = 16; if (size == null) return { kind: "malformed", reason: "u64_overflow" }; }
    else if (size === 0) size = moov.length - o;
    if (size < hdr) return { kind: "malformed", reason: "box_size" };
    if (t === "mvhd") {
      if (o + size > moov.length) return { kind: "malformed", reason: complete ? "box_overrun" : "budget" };
      const p = o + hdr;
      const version = moov[p];
      if (version !== 0 && version !== 1) return { kind: "malformed", reason: "mvhd_version" };
      const need = version === 1 ? 32 : 20;
      if (p + need > o + size) return { kind: "malformed", reason: "mvhd_truncated" };
      const timescale = version === 1 ? u32(moov, p + 20) : u32(moov, p + 12);
      if (!timescale) return { kind: "malformed", reason: "timescale_zero" };
      if (version === 0 && u32(moov, p + 16) === 0xffffffff) return { kind: "unknown_declared" };
      if (version === 1 && u32(moov, p + 24) === 0xffffffff && u32(moov, p + 28) === 0xffffffff) return { kind: "unknown_declared" };
      const duration = version === 1 ? u64(moov, p + 24) : u32(moov, p + 16);
      if (duration == null) return { kind: "malformed", reason: "u64_overflow" };
      if (duration === 0) return { kind: "unknown_declared" }; // e.g. fragmented MP4: length lives in fragments
      const s = duration / timescale;
      if (!Number.isFinite(s) || s <= 0 || s > MAX_PLAUSIBLE_SECONDS) return { kind: "malformed", reason: "implausible" };
      return { kind: "measured", seconds: s };
    }
    if (o + size > moov.length) return { kind: "malformed", reason: complete ? "box_overrun" : "budget" };
    o += size;
  }
  return { kind: "malformed", reason: complete ? "no_mvhd" : "budget" };
}

/** Walk top-level boxes with a box-count and total-bytes budget. Reader failures → io_error (retry), never "unknown". */
export async function probeMp4(read: RangeReader, fileSize: number): Promise<Probe> {
  if (!Number.isSafeInteger(fileSize) || fileSize < 16) return { kind: "malformed", reason: "too_small" };
  let used = 0;
  const r = async (off: number, len: number) => {
    if (used + len > PROBE_MAX_READ_BYTES) len = PROBE_MAX_READ_BYTES - used;
    if (len <= 0) return null;
    used += len;
    let b: Uint8Array;
    try { b = await read(off, len); } catch (e) { throw new IoError(e instanceof Error ? e.message : "read"); }
    if (b.length !== len) throw new IoError("short_read");
    return b;
  };
  try {
    let o = 0;
    for (let i = 0; i < PROBE_MAX_TOP_BOXES && o + 8 <= fileSize; i++) {
      const h = await r(o, Math.min(16, fileSize - o));
      if (!h) return { kind: "malformed", reason: "budget" };
      let size: number | null = u32(h, 0);
      const t = type(h, 4);
      let hdr = 8;
      if (size === 1) { if (h.length < 16) return { kind: "malformed", reason: "box_size" }; size = u64(h, 8); hdr = 16; if (size == null) return { kind: "malformed", reason: "u64_overflow" }; }
      else if (size === 0) size = fileSize - o;
      if (size < hdr || o + size > fileSize) return { kind: "malformed", reason: size < hdr ? "box_size" : "box_overrun" };
      if (i === 0) {
        if (t !== "ftyp" || size < 16) return { kind: "malformed", reason: "no_ftyp" };
        const brand = String.fromCharCode(h[8], h[9], h[10], h[11]);
        if (!BRANDS.has(brand)) {
          const body = await r(o + 16, Math.min(size - 16, 256));
          let compat = false;
          for (let k = 0; body && k + 4 <= body.length; k += 4) if (BRANDS.has(String.fromCharCode(body[k], body[k + 1], body[k + 2], body[k + 3]))) compat = true;
          if (!compat) return { kind: "malformed", reason: "brand" };
        }
      }
      if (t === "moov") {
        const want = size - hdr;
        const body = await r(o + hdr, want);
        if (!body) return { kind: "malformed", reason: "budget" };
        return probeMoov(body, body.length === want);
      }
      o += size;
    }
    return { kind: "malformed", reason: "no_moov" };
  } catch (e) {
    if (e instanceof IoError) return { kind: "io_error", reason: e.message };
    throw e;
  }
}

/** Probe → persisted status. io_error returns null: record nothing, ask to retry. */
export function classifyProbe(p: Probe): SourceStatus | null {
  if (p.kind === "io_error") return null;
  if (p.kind === "malformed") return "rejected_media";
  if (p.kind === "unknown_declared") return "unknown_duration";
  return isSourceTooLong(p.seconds) ? "measured_too_long" : "measured_ok";
}
