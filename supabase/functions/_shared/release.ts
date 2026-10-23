// Validation for app release records sent by the EAS build workflow (see publish-release).

type ReleaseInput = { platform?: unknown; build_number?: unknown; version?: unknown; download_url?: unknown; notes?: unknown; eas_build_id?: unknown };

/** The release row to store, or null when the payload is not a valid release. */
export function parseRelease(body: ReleaseInput) {
  const buildNumber = Number(body.build_number);
  if (body.platform !== 'android' && body.platform !== 'ios') return null;
  if (!Number.isInteger(buildNumber) || buildNumber <= 0) return null;
  if (typeof body.version !== 'string' || !body.version.trim()) return null;
  if (typeof body.download_url !== 'string' || !body.download_url.startsWith('https://')) return null;
  return {
    platform: body.platform, build_number: buildNumber, version: body.version.trim(), download_url: body.download_url,
    notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 500) : null,
    eas_build_id: typeof body.eas_build_id === 'string' ? body.eas_build_id : null
  };
}
