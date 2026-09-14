// mobile/plugins/withGoogleMapsApiKeyPlaceholder.js
//
// react-native-maps needs a com.google.android.geo.API_KEY <meta-data> tag
// in AndroidManifest.xml. This injects the Gradle placeholder STRING
// ("${GOOGLE_MAPS_API_KEY}"), never the real key value — the real value
// lives in android/local.properties (gitignored, see
// local.properties.example) or the GOOGLE_MAPS_API_KEY env var, resolved
// at build time via android/app/build.gradle's manifestPlaceholders
// (search that file for GOOGLE_MAPS_API_KEY to see the actual
// local.properties-or-env-var fallback logic this plugin depends on).
//
// Putting the real key in app.json instead (Expo's usual
// android.config.googleMaps.apiKey field) would commit it to git — this
// app already had that exact incident once: the key was hardcoded into
// AndroidManifest.xml and exposed on GitHub for ~8 days (revoked
// 2026-08-07, see the comment above GOOGLE_MAPS_API_KEY in .env.example).
// This plugin exists specifically so that never has to happen again.
//
// Without it, `expo prebuild` fully regenerates AndroidManifest.xml from
// declarative config on every run and has no way to know to preserve a
// manually-added meta-data tag that isn't derived from any plugin —
// confirmed 2026-09-13: a prebuild run for unrelated native-module
// changes (expo-speech-recognition) silently dropped this exact line,
// which would have shipped a build with broken Google Maps.

const { withAndroidManifest } = require('@expo/config-plugins');

const META_DATA_NAME = 'com.google.android.geo.API_KEY';
const PLACEHOLDER = '${GOOGLE_MAPS_API_KEY}';

module.exports = function withGoogleMapsApiKeyPlaceholder(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) return config;
    if (!application['meta-data']) application['meta-data'] = [];

    const existing = application['meta-data'].find(
      (m) => m.$ && m.$['android:name'] === META_DATA_NAME
    );
    if (existing) {
      existing.$['android:value'] = PLACEHOLDER;
    } else {
      application['meta-data'].push({
        $: { 'android:name': META_DATA_NAME, 'android:value': PLACEHOLDER },
      });
    }
    return config;
  });
};
