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

