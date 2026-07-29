// src/i18n/localePacks.ts
// ─────────────────────────────────────────────────────────────────
// On-demand locale packs. English ships bundled in the app binary
// (see src/i18n/index.ts); every other locale is downloaded from
// backend/routes/locale_packs.py the first time a user selects it in
// Settings, then cached to disk so it works offline afterward.
//
// Deliberately uses Paths.document (persistent), not Paths.cache — a
// user's deliberately-chosen language shouldn't get silently evicted
// under storage pressure and regress to English offline, the way
// src/db/questions.ts's 7-day-TTL sqlite cache is fine to lose.
//
// Imports the `i18next` singleton directly (not this package's own
// ./index) so there's no circular import with index.ts, which imports
// restoreLastLocale from this file.
// ─────────────────────────────────────────────────────────────────
import i18n from 'i18next';
import { File, Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '@/src/api/client';
import { DEFAULT_LOCALE, LANGUAGE_STORAGE_KEY } from './locales';

const PACK_VERSION_KEY_PREFIX = '@ppw_locale_pack_version:';
const FETCH_TIMEOUT_MS = 5000;

type Manifest = Record<string, { version: string; updatedAt: string }>;

function packFile(code: string): File {
  return new File(Paths.document, `locale_${code}.json`);
}

async function fetchManifest(): Promise<Manifest | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/api/v1/locale-packs/manifest`, { signal: controller.signal });
    if (!res.ok) {
      if (__DEV__) console.warn(`[i18n] manifest fetch returned ${res.status} from ${API_BASE}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    // Swallowed everywhere this is called — restoreLastLocale/ensureLocaleLoaded
    // must never throw on a network hiccup. But a silent catch here means a
    // real config problem (ATS blocking plain HTTP to a LAN dev backend, a
    // stale EXPO_PUBLIC_API_URL baked into the build, backend not running)
    // is otherwise invisible — only a generic "Could not download this
    // language" ever reaches the UI. Log the actual cause in dev so it's
    // visible in the Metro/Xcode console instead of guessed at blind.
    if (__DEV__) console.warn(`[i18n] manifest fetch failed for ${API_BASE}:`, e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadCachedPack(code: string): Promise<Record<string, unknown> | null> {
  const file = packFile(code);
  if (!file.exists) return null;
  try {
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
}

function registerPack(code: string, data: Record<string, unknown>): void {
  if (!i18n.hasResourceBundle(code, 'translation')) {
    i18n.addResourceBundle(code, 'translation', data, true, true);
  }
}

/**
 * Ensures `code`'s strings are loaded into i18next, downloading and
 * caching the pack from the backend if needed. Never throws — resolves
 * `false` only when no usable pack (fresh or cached) could be obtained.
 */
export async function ensureLocaleLoaded(code: string): Promise<boolean> {
  if (code === DEFAULT_LOCALE) return true;
  if (i18n.hasResourceBundle(code, 'translation')) return true;

  const manifest = await fetchManifest();
  const remoteVersion = manifest?.[code]?.version;
  const cachedVersion = await AsyncStorage.getItem(PACK_VERSION_KEY_PREFIX + code);
  const file = packFile(code);

  // Version matches what's already on disk — load locally, no re-download.
  if (remoteVersion && remoteVersion === cachedVersion && file.exists) {
    const cached = await loadCachedPack(code);
    if (cached) {
      registerPack(code, cached);
      return true;
    }
  }

  if (remoteVersion) {
    try {
      const downloaded = await File.downloadFileAsync(
        `${API_BASE}/api/v1/locale-packs/${code}`,
        file,
        { idempotent: true }
      );
      const data = JSON.parse(await downloaded.text());
      registerPack(code, data);
      await AsyncStorage.setItem(PACK_VERSION_KEY_PREFIX + code, remoteVersion);
      return true;
    } catch (e) {
      if (__DEV__) console.warn(`[i18n] pack download failed for '${code}' from ${API_BASE}:`, e);
      // Fall through to the best-effort cached load below.
    }
  }

  // Manifest unreachable or download failed — use whatever's cached on
  // disk, even if stale, rather than failing outright.
  const cached = await loadCachedPack(code);
  if (cached) {
    registerPack(code, cached);
    return true;
  }
  return false;
}

/**
 * Restores the last-picked language on cold boot, from local cache ONLY —
 * this never touches the network, so app startup never depends on
 * connectivity. Called once from index.ts, mirroring the timing of the
 * restore logic it replaces.
 */
export async function restoreLastLocale(): Promise<void> {
  const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (!stored || stored === DEFAULT_LOCALE) return;

  const cached = await loadCachedPack(stored);
  if (cached) {
    registerPack(stored, cached);
    i18n.changeLanguage(stored);
    // The synchronous load above trusts whatever's on disk, however old —
    // that's fine for instant, offline-safe boot, but a pack downloaded
    // before a translation fix ships (e.g. a stale "common.back") would
    // otherwise never get corrected: once registered, ensureLocaleLoaded's
    // own `hasResourceBundle` short-circuit (see above) means no version
    // check ever runs again for the rest of the session. Revalidate against
    // the manifest in the background and hot-swap if it's actually stale.
    revalidateLocaleInBackground(stored);
    return;
  }

  // No local cache for a persisted non-English choice — only possible
  // right after migrating off the old bundle-everything model (a
  // pre-existing install that never downloaded a pack) or on a brand-new
  // device mid-first-selection. Fetch opportunistically in the background
  // without blocking render; stays silently on English if it also fails.
  ensureLocaleLoaded(stored).then((ok) => {
    if (ok) i18n.changeLanguage(stored);
  });
}

/**
 * Best-effort background check: is the disk-cached pack for `code` still
 * current per the manifest's content-hash version? If not, re-download and
 * hot-swap the already-registered i18next bundle in place. Never throws,
 * never blocks — the synchronous cache load in restoreLastLocale() already
 * gave the user a working UI.
 */
async function revalidateLocaleInBackground(code: string): Promise<void> {
  const manifest = await fetchManifest();
  const remoteVersion = manifest?.[code]?.version;
  if (!remoteVersion) return;

  const cachedVersion = await AsyncStorage.getItem(PACK_VERSION_KEY_PREFIX + code);
  if (remoteVersion === cachedVersion) return; // disk cache is already current

  const file = packFile(code);
  try {
    const downloaded = await File.downloadFileAsync(
      `${API_BASE}/api/v1/locale-packs/${code}`,
      file,
      { idempotent: true }
    );
    const data = JSON.parse(await downloaded.text());
    // Bypass registerPack's hasResourceBundle guard — this is exactly the
    // "already registered but now stale" case that guard would otherwise skip.
    i18n.addResourceBundle(code, 'translation', data, true, true);
    await AsyncStorage.setItem(PACK_VERSION_KEY_PREFIX + code, remoteVersion);
    // addResourceBundle alone doesn't re-render mounted screens; re-firing
    // changeLanguage with the same language re-emits `languageChanged` so
    // useTranslation() subscribers pick up the corrected strings.
    if (i18n.language === code) i18n.changeLanguage(code);
  } catch {
    // Best-effort — keep using whatever was already loaded from disk.
  }
}
