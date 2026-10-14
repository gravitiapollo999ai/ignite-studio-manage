// Incremental SHA-256 over a stream: constant memory, exact byte count required. Browser/worker safe.
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";

export async function streamSha256(body: ReadableStream<Uint8Array>, expectedBytes: number): Promise<{ ok: true; hex: string } | { ok: false; reason: "size_mismatch" | "read_error" }> {
  const h = sha256.create();
  const reader = body.getReader();
  let n = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > expectedBytes) { await reader.cancel(); return { ok: false, reason: "size_mismatch" }; }
      h.update(value);
    }
  } catch { return { ok: false, reason: "read_error" }; }
  if (n !== expectedBytes) return { ok: false, reason: "size_mismatch" };
  return { ok: true, hex: bytesToHex(h.digest()) };
}
