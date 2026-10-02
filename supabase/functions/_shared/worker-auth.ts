// Shared-secret check for the scheduled workers (send-emails, send-push), which pg_cron calls with x-worker-secret.

/** Constant-time comparison so the secret cannot be recovered through response timing. */
export function secretMatches(provided: string | null, expected: string): boolean {
  if (provided === null) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  let difference = a.length ^ b.length;
  for (let index = 0; index < b.length; index++) difference |= (a[index] ?? 0) ^ b[index];
  return difference === 0;
}

/** Null when the request may proceed; otherwise the response to return. */
export function rejectUnauthorized(request: Request, secret: string | undefined): Response | null {
  if (!secret) return Response.json({ error: 'EMAIL_WORKER_SECRET is not configured' }, { status: 500 });
  if (request.method !== 'POST' || !secretMatches(request.headers.get('x-worker-secret'), secret)) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  return null;
}
