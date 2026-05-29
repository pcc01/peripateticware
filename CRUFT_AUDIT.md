# Peripateticware — Cruft Audit

> Files and directories that can be reviewed and removed.
> Do NOT delete anything without checking the "Safe to delete?" column.
> Last updated: May 2026

---

## 1. Root-Level Misplaced / Stale Files

These files belong either in `docs/`, a specific subdirectory, or nowhere at all.

| File | What it is | Safe to delete? |
|------|-----------|-----------------|
| `repomix-output.xml` | Auto-generated codebase snapshot for LLM context | ✅ Yes |
| `repomix-output--old.xml` | Older version of above | ✅ Yes |
| `diagnostic-output.txt` | Debug output from a one-off diagnostic run | ✅ Yes |
| `run-diagnostic.ps1` | PowerShell script that generated the above | ✅ Yes |
| `update_hash.sql` | One-off migration to update a password hash | ✅ Yes (once applied) |
| `privacy_engine.txt` | Notes / draft content | ✅ Yes (content is in code) |
| `peripateticware_complete_202605081840 - Shortcut.lnk` | Windows Explorer shortcut | ✅ Yes |
| `BottomSheet.tsx` | Stray React component at root (not in `frontend/src`) | ✅ Yes — move or delete |
| `auth.ts` | Stray TypeScript file at root | ✅ Yes — move or delete |
| `app.json` | React Native / Expo config — project is web-only | ✅ Yes |
| `tsconfig.json` | Root-level TS config duplicating `frontend/tsconfig.json` | ⚠️ Check if anything references it first |
| `package.json` + `package-lock.json` | Root-level Node config — no root build step exists | ⚠️ Check if any script uses it |
| `node_modules/` (root) | Installed for the above root package.json | ✅ Yes (after confirming root package.json is removed) |
| `complete_schema.sql` | Old merged schema snapshot | ⚠️ Keep if `database/init.sql` is not yet complete; delete after confirming |
| `alembic.ini` | Alembic config — belongs in `backend/` | ⚠️ Move to `backend/` if not already there; check `backend/alembic.ini` |
| `pgbouncer.ini` | PgBouncer config — belongs in `database/` or `infra/` | ⚠️ Move or delete if not used |
| `nginx.conf` | Nginx config — duplicate of `nginx/nginx.conf` | ⚠️ Consolidate to `nginx/` only |
| `integration_catalog.docx` | Delivery planning doc | 📁 Move to `docs/` |
| `integration_catalog_v2.docx` | Newer version of above | 📁 Move to `docs/` |
| `peripateticware_assessment.docx` | Assessment planning doc | 📁 Move to `docs/` |
| `MASTER_INDEX.md` | Build-phase index of all files | 📁 Move to `docs/` or delete |
| `CONTRIBUTING.md` | Contributor guide — good to keep | ✅ Keep at root |
| `CONTRIBUTORS.md` | Contributor list | ✅ Keep at root |
| `FAQ.md` | Frequently asked questions | ✅ Keep at root |

---

## 2. Old Docker Compose Files

Keep `docker-compose.yml` (main) and `docker-compose.dev.yml`. The rest are historical.

| File | Safe to delete? |
|------|-----------------|
| `docker-compose-aws_old.yml` | ✅ Yes |
| `docker-compose-gcp_old.yml` | ✅ Yes |
| `docker-compose-local-all-docker_old.yml` | ✅ Yes |
| `docker-compose_old.yml` | ✅ Yes |

---

## 3. Frontend — Duplicate / Stale Components

| File | Issue | Action |
|------|-------|--------|
| `src/components/AppRouter.tsx` | Unused — `App.tsx` is the real router; this imports pages that don't exist | 🗑️ Delete |
| `src/components/auth/AppRouter.tsx` | Unused; has broken syntax (`const { t }` inside JSX) | 🗑️ Delete |
| `src/components/teacher/AppRouter.tsx` | Unused third copy of AppRouter | 🗑️ Delete |
| `src/components/Header.tsx` | Top-level duplicate of `components/common/Header.tsx` | 🗑️ Delete after verifying nothing imports it |
| `src/components/LoadingSpinner.tsx` | Top-level duplicate of `components/common/LoadingSpinner.tsx` | 🗑️ Delete after verifying nothing imports it |
| `src/components/ActivityBuilder-Updated.tsx` | Superseded by `EnhancedActivityBuilder` | 🗑️ Delete |
| `src/components/ActivityBuilder.tsx` | Original; superseded by `EnhancedActivityBuilder` | ⚠️ Verify `EnhancedActivityBuilder` covers all features first |
| `src/components/CrowByAgeBand_Alt2_GeometricNative.tsx` | Design exploration — not used in production | 🗑️ Delete |
| `src/components/CrowByAgeBand_Alt3_OrganicNative.tsx` | Design exploration — not used in production | 🗑️ Delete |
| `src/components/useActivity.ts` | Hook in wrong directory; canonical version is `hooks/useActivity.ts` | 🗑️ Delete after checking imports |
| `src/components/index.tsx` | Barrel export — check if anything uses it | ⚠️ Audit imports first |

---

## 4. Frontend — Duplicate Pages

Flat pages in `src/pages/` that shadow role-specific versions in `src/pages/teacher/` etc. `App.tsx` imports from both places — these need to be consolidated.

| Flat file | Nested duplicate | Which to keep |
|-----------|-----------------|---------------|
| `pages/TeacherActivityListPage.tsx` | `pages/teacher/ActivityListPage.tsx` | Keep **nested**; `App.tsx` imports both |
| `pages/TeacherSubmissionsPage.tsx` | *(no nested equivalent)* | Keep flat until a nested version is created |
| `pages/TeacherSettingsPage.tsx` | *(no nested equivalent)* | Keep flat |
| `pages/TeacherTourPage.tsx` | `pages/teacher/TeacherTourPage.tsx` | Keep **nested** |
| `pages/StudentSettingsPage.tsx` | *(no nested equivalent)* | Keep flat |
| `pages/ParentSettingsPage.tsx` | *(no nested equivalent)* | Keep flat |
| `pages/ParentProgressPage.tsx` | *(no nested equivalent)* | Keep flat |
| `pages/ParentFeaturesPage.tsx` | `pages/parent/ParentFeaturesPage.tsx` | Keep **nested** |
| `pages/StudentHowItWorksPage.tsx` | `pages/student/StudentHowItWorksPage.tsx` | Keep **nested** |
| `pages/ProjectsPage.tsx` | `pages/teacher/ProjectsPage.tsx` | Keep **nested** |
| `pages/RegisterPage.tsx` | Superseded by `components/auth/SignUpScreen.tsx` | 🗑️ Delete after confirming no imports |
| `pages/AdminSettingsPage.tsx` | *(no nested equivalent)* | Keep flat |

---

## 5. Frontend — Duplicate Hooks & Services

| File | Issue | Action |
|------|-------|--------|
| `src/components/useActivity.ts` | Duplicate of `src/hooks/useActivity.ts` | 🗑️ Delete the `components/` one |
| `src/services/api.ts` + `src/services/apiClient.ts` | Two API client implementations | ⚠️ Consolidate — `apiClient.ts` is likely newer |
| `src/services/student.ts` + `src/services/teacher.ts` | Legacy service files alongside newer `captureService.ts` etc. | ⚠️ Review for overlap |

---

## 6. Backend — Stale Files

| File / Dir | Issue | Action |
|------------|-------|--------|
| `backend/repomix-output.xml` | Auto-generated codebase snapshot | 🗑️ Delete |
| `backend/Dockerfile.diagnostic` | One-off diagnostic Dockerfile | 🗑️ Delete |
| `backend/media/` | Empty placeholder directory | ⚠️ Keep if media uploads expected; already in compose volume |
| `backend/uploads/` | Empty placeholder directory | ⚠️ Keep — compose mounts this |
| `backend/docs/` | Check contents — may be stale | ⚠️ Review |

---

## 7. Delivery Packages (CheckwCoWork folder)

The `CheckwCoWork/` folder on your Desktop contains the original delivery packages that were used as integration source material. Now that integration is complete, these can be archived or deleted:

- `peripateticware-admin-panel/`
- `peripateticware_phase5_7_complete/`
- `PHASE7_PERIPATETICWARE_SPEC/`

These are **not** in the project folder itself, so they won't be committed to git. Archive to a zip or delete when you're confident the integration is stable.

---

## Suggested Deletion Order

Run through these in order — low risk first:

1. `repomix-output*.xml`, `diagnostic-output.txt`, `run-diagnostic.ps1` (root + backend)
2. `docker-compose-*_old.yml` files
3. `peripateticware_complete_202605081840 - Shortcut.lnk`, `app.json`, `BottomSheet.tsx`, `auth.ts` (root)
4. `CrowByAgeBand_Alt2_GeometricNative.tsx`, `CrowByAgeBand_Alt3_OrganicNative.tsx`
5. `ActivityBuilder-Updated.tsx`, duplicate `AppRouter.tsx` files
6. `components/useActivity.ts` (after confirming `hooks/useActivity.ts` is the import target)
7. Flat-level page duplicates (after updating any imports in `App.tsx`)
8. Root-level `node_modules/`, `package.json`, `package-lock.json`, `tsconfig.json`, `app.json`
