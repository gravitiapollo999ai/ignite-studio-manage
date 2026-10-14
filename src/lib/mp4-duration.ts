// Reads an MP4/MOV duration from the container header (moov/mvhd) using ranged reads, so the server
// never trusts a browser-reported length and never downloads the whole video.

export const SOURCE_MAX_SECONDS = 30;
/** Container/frame rounding allowance: a "30 s" export is often 30.02 s. Anything above is rejected. */
export const SOURCE_TOLERANCE_SECONDS = 0.05;

export function isSourceTooLong(seconds: number): boolean {
  return seconds > SOURCE_MAX_SECONDS + SOURCE_TOLERANCE_SECONDS;
}

export type RangeReader = (offset: number, length: number) => Promise<Uint8Array>;

const MAX_MOOV_BYTES = 64 * 1024 * 1024;

function u32(b: Uint8Array, o: number) { return ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]; }
function u64(b: Uint8Array, o: number) { return u32(b, o) * 2 ** 32 + u32(b, o + 4); }
function type(b: Uint8Array, o: number) { return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]); }

/** Parse mvhd inside a moov payload → seconds, or null. */
export function durationFromMoov(moov: Uint8Array): number | null {
  let o = 0;
  while (o + 8 <= moov.length) {
    let size = u32(moov, o);
    const t = type(moov, o + 4);
    let hdr = 8;
    if (size === 1) { size = u64(moov, o + 8); hdr = 16; }
    if (size < hdr) return null;
    if (t === "mvhd") {
      const p = o + hdr;
      const version = moov[p];
      const timescale = version === 1 ? u32(moov, p + 20) : u32(moov, p + 12);
      const duration = version === 1 ? u64(moov, p + 24) : u32(moov, p + 16);
      if (!timescale) return null;
      return duration / timescale;
    }
    o += size;
  }
  return null;
}

/** Walk top-level boxes of a file of `fileSize` bytes; returns seconds or null when unreadable. */
export async function readMp4Duration(read: RangeReader, fileSize: number): Promise<number | null> {
  let o = 0;
  for (let i = 0; i < 64 && o + 8 <= fileSize; i++) {
    const h = await read(o, 16);
    if (h.length < 8) return null;
    let size = u32(h, 0);
    const t = type(h, 4);
    let hdr = 8;
    if (size === 1) { if (h.length < 16) return null; size = u64(h, 8); hdr = 16; }
    else if (size === 0) size = fileSize - o;
    if (size < hdr) return null;
    if (t === "moov") {
      if (size > MAX_MOOV_BYTES) return null;
      return durationFromMoov(await read(o + hdr, size - hdr));
    }
    o += size;
  }
  return null;
}
