// Constant-time comparison of the x-api-key header against JOBS_FEED_API_KEY.
export function checkFeedKey(request: Request): boolean {
  const expected = process.env["JOBS_FEED_API_KEY"];
  const got = request.headers.get("x-api-key") ?? "";
  if (!expected || got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
