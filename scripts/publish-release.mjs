// Announces a finished EAS build to installed apps through the publish-release Edge Function.
// Run by .eas/workflows/build-android-on-main.yml after the Android build. Needs, from the EAS "preview" environment:
//   EXPO_PUBLIC_SUPABASE_URL, RELEASE_PUBLISH_SECRET
// and, from the build job: BUILD_ID, BUILD_NUMBER (Android versionCode), APP_VERSION.
import { execSync } from 'node:child_process';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const secret = process.env.RELEASE_PUBLISH_SECRET;
const buildId = process.env.BUILD_ID;
const buildNumber = process.env.BUILD_NUMBER;
const version = process.env.APP_VERSION;
const missing = Object.entries({ EXPO_PUBLIC_SUPABASE_URL: url, RELEASE_PUBLISH_SECRET: secret, BUILD_ID: buildId, BUILD_NUMBER: buildNumber, APP_VERSION: version })
  .filter(([, value]) => !value).map(([name]) => name);
if (missing.length) {
  console.error(`Not published: missing ${missing.join(', ')}.`);
  process.exit(1);
}

// The internal-distribution page installs the APK on Android; anyone with the link can open it.
const downloadUrl = `https://expo.dev/accounts/alenui/projects/grocefy/builds/${buildId}`;
let notes = null;
try { notes = execSync('git log -1 --format=%s', { encoding: 'utf8' }).trim() || null; } catch { /* notes are optional */ }

const response = await fetch(`${url}/functions/v1/publish-release`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-release-secret': secret },
  body: JSON.stringify({ platform: 'android', build_number: Number(buildNumber), version, download_url: downloadUrl, notes, eas_build_id: buildId })
});
const body = await response.text();
if (!response.ok) {
  console.error(`Not published (${response.status}): ${body}`);
  process.exit(1);
}
console.log(`Published Android build ${buildNumber} (${version}): ${body}`);
