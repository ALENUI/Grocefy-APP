// Announces a finished EAS build to installed apps through the publish-release Edge Function.
// Run by .eas/workflows/build-android-on-main.yml after the Android build. Needs, from the EAS "preview" environment:
//   EXPO_PUBLIC_SUPABASE_URL, RELEASE_PUBLISH_SECRET
// and, from the build job: BUILD_ID, BUILD_NUMBER (Android versionCode), APP_VERSION.
// Optional: EXPO_RELEASE_TOKEN (an Expo robot/access token, secret) to look up the direct .apk link, which installed apps
// download and install themselves. Without it they open the build page in the browser instead.
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
const buildPage = `https://expo.dev/accounts/alenui/projects/grocefy/builds/${buildId}`;

/** The build's .apk download link from Expo's API, or null without a token or on any failure. */
async function apkUrl() {
  const token = process.env.EXPO_RELEASE_TOKEN ?? process.env.EXPO_TOKEN;
  if (!token) return null;
  try {
    const response = await fetch('https://api.expo.dev/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: 'query ($id: ID!) { builds { byId(buildId: $id) { artifacts { buildUrl } } } }', variables: { id: buildId } })
    });
    const url = (await response.json())?.data?.builds?.byId?.artifacts?.buildUrl;
    return typeof url === 'string' && url.startsWith('https://') && /\.apk(\?|$)/i.test(url) ? url : null;
  } catch (error) {
    console.warn(`Could not look up the APK link: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}
const directUrl = await apkUrl();
const downloadUrl = directUrl ?? buildPage;
console.log(directUrl ? `APK: ${directUrl}` : 'No EXPO_RELEASE_TOKEN or APK link found; publishing the build page.');
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
