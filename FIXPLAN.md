# Peripateticware — Fix Plan
Generated: 2026-05-27

## What Works
- Login (all four test users) ✅
- Routing / protected routes ✅
- Backend API running at /api/v1/* ✅
- Vite proxy correctly forwarding to backend container ✅

---

## Priority 1 — Sign-Up (broken, easy fix)

**Root cause:** `SignUpScreen.tsx` calls `useAuthStore().signup()`, which POSTs to
`/auth/signup` (proxied → `/api/v1/auth/signup`). The backend `SignupRequest` model
expects `{ email, password, password_confirm, username?, full_name?, role? }`.
The frontend's `stores/auth.ts` `signup()` sends `{ email, password, password_confirm,
first_name, last_name, name, role }` — `username` is missing (backend requires it or
must make it optional).

**Fixes needed:**
1. `backend/routes/auth.py` — Make `username` optional on `SignupRequest`, auto-generate
   it from email prefix if not supplied (e.g. `email.split('@')[0]`).
2. `frontend/src/components/auth/SignUpScreen.tsx` — The i18n missing-key errors
   (`auth.login_btn`, `auth.no_account`, etc.) mean the component is looking up
   `landing:auth.login_btn` but the key path in the JSON is `auth.login_btn` under
   the `landing` namespace — this is a namespace/key format mismatch. Fix: use
   `t('auth.login_btn')` not `t('landing:auth.login_btn')` (or configure i18next
   defaultNS correctly so the `landing:` prefix is stripped before lookup).
3. `frontend/locales/en/landing.json` — All auth keys exist ✅, just need fix #2 above.

---

## Priority 2 — Activity Store (stub bodies, no real API calls)

**Root cause:** `frontend/src/stores/teacher.ts` has stub implementations for
`fetchActivities`, `fetchActivity`, `getActivity`, `createActivity`, `updateActivity`.
The bodies set loading=true then immediately set loading=false with no fetch at all.
`createActivity` returns a hardcoded stub object instead of calling the API.
`saveActivity` at line 265 does call `/api/v1/activities` but never sends the
Authorization header — the backend requires Bearer token.

**Fixes needed (all in `frontend/src/stores/teacher.ts`):**

```ts
// Helper used by all store actions
const authHeader = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token') ?? ''}`,
})

fetchActivities: async (params) => {
  set({ activityLoading: true })
  try {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    const res = await fetch(`/api/v1/activities${qs}`, { headers: authHeader() })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    set({ activities: data.activities ?? data, activityLoading: false })
  } catch (e) { set({ activityError: String(e), activityLoading: false }) }
},

fetchActivity / getActivity: async (id) => {
  set({ activityLoading: true })
  try {
    const res = await fetch(`/api/v1/activities/${id}`, { headers: authHeader() })
    if (!res.ok) throw new Error(await res.text())
    set({ currentActivity: await res.json(), activityLoading: false })
  } catch (e) { set({ activityError: String(e), activityLoading: false }) }
},

createActivity: async (data) => {
  set({ loading: true })
  try {
    const res = await fetch('/api/v1/activities', {
      method: 'POST', headers: authHeader(), body: JSON.stringify(data)
    })
    if (!res.ok) throw new Error(await res.text())
    const activity = await res.json()
    set(s => ({ activities: [...s.activities, activity], loading: false }))
    return activity
  } catch (e) { set({ error: String(e), loading: false }); throw e }
},

updateActivity: // same pattern with PUT /api/v1/activities/:id
```

Also fix `saveActivity` (line 265) to add `headers: authHeader()`.

---

## Priority 3 — AI Activity Generation (inference not wired)

**Root cause:** `backend/routes/inference.py` exists with `/inquiry`, `/multimodal-process`,
`/rag-retrieve`, etc. but is NOT registered in `main.py` (no `include_router` for it).
The teacher components `OllamaLessonSuggestions.tsx` and `EnhancedActivityBuilder.tsx`
call these endpoints, which currently 404.

**Fixes needed:**
1. `backend/main.py` — Add inside the try block alongside other routers:
   ```python
   from routes.inference import router as inference_router
   app.include_router(inference_router, prefix="/api/v1/inference", tags=["inference"])
   ```
2. `frontend/src/components/teacher/OllamaLessonSuggestions.tsx` — Verify it calls
   `/api/v1/inference/inquiry` with Bearer token. If calling a different path, update.
3. `frontend/src/components/teacher/EnhancedActivityBuilder.tsx` — Same check.
4. Backend: confirm `OLLAMA_BASE_URL` (`http://host.docker.internal:11434`) is reachable
   (Ollama must be running on the Windows host). If not running, the inference route
   should gracefully return a 503 instead of crashing.

Also note: `routes/linking.py` (curriculum linking) and `routes/curriculum.py` are also
not included in `main.py`. Check if ActivityBuilder uses them.

---

## Priority 4 — Missing i18n Keys (UI cosmetic but affects UX)

The `landing` namespace JSON in `frontend/dist/locales/en/landing.json` has the auth
keys, but the `src` directory has no `locales` folder — only `dist` does.
In dev mode Vite serves from `src` or `public`, not `dist`.

**Fixes needed:**
1. Check `frontend/public/locales/` — if missing, copy `dist/locales/` there. Vite dev
   server serves `public/` at root, so `public/locales/en/landing.json` → available at
   `/locales/en/landing.json`.
2. The i18next backend config likely fetches `/locales/{{lng}}/{{ns}}.json` — verify
   this path exists at runtime. If it does, the missing-key warnings disappear.

---

## Priority 5 — Teacher Store: teacher_id Placeholder

`createActivity` (line 222 stub) has `teacher_id: 'current_teacher_id'`.
The backend derives `teacher_id` from the JWT token on the server side — it should NOT
be sent by the client. Confirm `activities.py` `create_activity` extracts teacher_id
from `current_user` (the decoded JWT), not from the request body. If it does, just
remove teacher_id from the client payload.

---

## Priority 6 — Remaining ComingSoonPage Routes

These routes render `<ComingSoonPage>` and need real implementations eventually:
- `/teacher/students` — Student Management
- `/admin/users` — User Management
- `/admin/classes` — Class Management
- `/admin/system`, `/admin/analytics`, `/admin/help`
- `/parent/messages`, `/parent/calendar`, `/parent/reports`, `/parent/notifications`

Lower priority — stub is acceptable for now.

---

## Order of Work for Tomorrow

1. **Fix i18n path** (30 min) — Copy/symlink locales to `public/`, verify dev server
   serves them. This fixes missing-key console noise across all screens.

2. **Fix SignupRequest** (30 min) — Make `username` optional in backend + verify
   frontend sends all required fields. Test signup → login flow end-to-end.

3. **Wire teacher store to real API** (1-2 hrs) — Replace stub bodies in `teacher.ts`
   with real fetch calls + auth headers. Test: list activities, create, edit, delete.

4. **Register inference router** (15 min) — One import + include_router line in main.py.
   Test: `/api/v1/inference/health` returns 200.

5. **Wire AI activity builder** (1 hr) — Confirm `OllamaLessonSuggestions` and
   `EnhancedActivityBuilder` call the correct inference endpoints with auth headers.
   Test with Ollama running on host.

6. **Register missing routers** (30 min) — `curriculum`, `linking`, `notifications`,
   `observability`, `email`, `reset` — check each for import errors then add to main.py.

7. **Student activity flow** (1-2 hrs) — `StudentDashboard` → `StudentActivityDetailPage`
   → `SessionPage`. Verify `student_activities.py` routes return correct data and
   student store calls them with auth headers.

8. **Parent dashboard** (1 hr) — Wire `ParentDashboard`, `ParentProgressPage` to
   `parent.py` routes.

---

## Quick Reference — Key File Locations

| What | File |
|------|------|
| Backend route registration | `backend/main.py` |
| Auth routes | `backend/routes/auth.py` |
| Activity CRUD | `backend/routes/activities.py` |
| AI inference | `backend/routes/inference.py` (NOT YET REGISTERED) |
| Teacher Zustand store | `frontend/src/stores/teacher.ts` |
| Auth Zustand store | `frontend/src/stores/auth.ts` |
| API axios client | `frontend/src/config/api.ts` |
| Vite proxy config | `frontend/vite.config.ts` |
| ORM models | `backend/models/database.py` |
| i18n translations | `frontend/dist/locales/en/landing.json` |
| App routes | `frontend/src/App.tsx` |
