// src/db/ownerUser.ts
//
// Shared-device data isolation (PERI_OFFLINE_SPEC_v2.md "Shared-device data
// isolation"): siblings can share a phone, each logging in separately.
// Every queue/progress read and write needs to know WHICH logged-in account
// it belongs to, so one child's work is never visible to, or sent under,
// another's login.
//
// Reads from the same local cache AuthContext restores on launch (works
// fully offline — no network, no auth check, just "whoever is currently
// logged in on this device").

import { getStoredUser } from '@/src/api/client';

interface CachedUser {
  id: string;
}

/** Current logged-in user's id. Empty string (never null/undefined) if
 * somehow nobody is cached, so every `owner_user_id = ?` comparison stays a
 * simple equality check with no NULL-handling. */
export async function getCurrentUserId(): Promise<string> {
  const user = await getStoredUser<CachedUser>();
  return user?.id ?? '';
}
