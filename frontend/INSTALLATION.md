# 🚀 PERIPATETICWARE FRONTEND - COMPLETE INSTALLATION GUIDE

## WHAT YOU HAVE

This is a **ready-to-use React 19 frontend** with:
✅ Clean TypeScript setup  
✅ Proper folder structure  
✅ All config files (Vite, Tailwind, ESLint, etc.)  
✅ Smart integration script  
✅ Placeholder App.tsx (will be replaced by your code)  

## ONE-COMMAND SETUP

```powershell
# Step 1: First time only - backup your broken frontend
cd C:\Users\pcerd\Downloads\peripateticware_complete__202605081840\peripateticware_complete_202605081840
Rename-Item frontend frontend-BROKEN-BACKUP-DO-NOT-USE

# Step 2: Extract this package and move to project root
# (Extract peripateticware-FRONTEND-COMPLETE.zip)
# The extracted folder should be named "frontend"

# Step 3: Run the integration script
cd frontend
.\INTEGRATE_AND_BUILD.ps1
```

**That's it!** The script will:
1. ✅ Install all npm dependencies
2. ✅ Copy ALL your working code from backup (types, stores, services, components, etc.)
3. ✅ Delete old/_broken files
4. ✅ Build and verify everything
5. ✅ Show you how to start

## WHAT THE SCRIPT DOES

The `INTEGRATE_AND_BUILD.ps1` script:

```
[1/6] Verifies backup exists
[2/6] Installs npm dependencies
[3/6] Integrates code from backup:
      ✓ Type definitions
      ✓ Zustand stores
      ✓ API services
      ✓ Configuration
      ✓ Utilities
      ✓ Custom hooks
      ✓ Components
      ✓ Pages
      ✓ Layouts
      ✓ Themes & Styles
      ✓ Localization files
[4/6] Cleans up old/_broken files
[5/6] Runs TypeScript type check
[6/6] Creates production build
```

All integrated code is automatically included in your `frontend/` folder.

## AFTER SETUP

Once `INTEGRATE_AND_BUILD.ps1` completes:

### Start Development Server
```powershell
npm run dev
```
Open http://localhost:5173 in your browser.

### Run Type Checks
```powershell
npm run type-check
```
Should show 0 errors if all imports are correct.

### Build for Production
```powershell
npm run build
```
Creates `dist/` folder (used by Docker).

### Run with Docker
```powershell
docker-compose up
```
Starts backend + frontend together.

## FOLDER STRUCTURE

After integration, you'll have:

```
frontend/
├── src/
│   ├── components/      # React components (from backup)
│   ├── pages/          # Page components (from backup)
│   ├── stores/         # Zustand stores (from backup)
│   ├── services/       # API services (from backup)
│   ├── hooks/          # Custom hooks (from backup)
│   ├── types/          # TypeScript types (from backup)
│   ├── utils/          # Utilities (from backup)
│   ├── config/         # API, constants, i18n config
│   ├── layouts/        # Layout wrappers (from backup)
│   ├── themes/         # Theme files (from backup)
│   ├── locales/        # i18n files (from backup)
│   ├── styles/         # Global styles (from backup)
│   ├── main.tsx        # Entry point
│   ├── App.tsx         # Root component
│   └── index.css       # Global CSS
├── public/
│   └── locales/        # Localization JSON files
├── package.json        # Dependencies
├── tsconfig.json       # TypeScript config
├── vite.config.ts      # Vite bundler config
├── tailwind.config.ts  # Tailwind CSS config
└── index.html          # HTML template
```

## WHAT GETS COPIED FROM BACKUP

The `INTEGRATE_AND_BUILD.ps1` script copies:

```
✓ src/types/              (teacher.ts, student.ts, auth.ts, session.ts, etc.)
✓ src/stores/             (auth.ts, teacher.ts, student.ts, projectStore.ts, etc.)
✓ src/services/           (auth.ts, curriculum.ts, student.ts, teacher.ts, etc.)
✓ src/config/             (constants.ts, api.ts, i18n.ts - OVERWRITES new ones)
✓ src/utils/              (privacy.ts, localization.ts, batchImport.ts, etc.)
✓ src/hooks/              (useAuth.ts, useProject.ts, useGeolocation.ts, etc.)
✓ src/components/         (all components - student/, teacher/, common/, auth/)
✓ src/pages/              (StudentDashboard.tsx, TeacherDashboard.tsx, etc.)
✓ src/layouts/            (TeacherLayout.tsx, etc.)
✓ src/themes/             (design-tokens.ts, theme.ts)
✓ src/styles/             (globals.css, etc.)
✓ src/locales/            (en, es, ar, ja, fr JSON files)
✓ public/locales/         (localization files in public folder)
```

## TROUBLESHOOTING

### "npm run dev" fails after INTEGRATE_AND_BUILD
**Solution:** Some imports may be broken. Run:
```powershell
npm run type-check
```
This shows exact errors. Fix them in `src/` and run `npm run dev` again.

### "Cannot find module '@/types/...'"
**Solution:** The file doesn't exist. Either:
1. It wasn't in backup (create it manually)
2. The path is wrong (fix the import)

### "Docker build fails"
**Solution:** Run `npm run build` first to create `dist/` folder:
```powershell
npm run build
docker build -f Dockerfile.web -t peripateticware-web .
```

### "npm install fails"
**Solution:** Clear cache and try again:
```powershell
rm -r node_modules
rm package-lock.json
npm install
```

## IMPORTANT NOTES

1. **Backup Created:** Your old frontend is now `frontend-BROKEN-BACKUP-DO-NOT-USE` - keep it for reference only.

2. **No More Conflicts:** The new frontend has:
   - No `*_old.tsx` files
   - No duplicate type definitions
   - Clean imports with `@/` path aliases

3. **Localization Ready:** All 5 languages (en, es, ar, ja, fr) are pre-configured.

4. **Backend Connection:** Frontend auto-connects to `http://localhost:8000/api/v1`.
   - Change in `.env`: `VITE_API_URL=http://your-backend-url`

5. **Docker Ready:** The Dockerfile works without changes:
   ```powershell
   docker-compose up
   ```

## VERIFICATION CHECKLIST

After setup, verify:

- [ ] `npm run type-check` shows 0 errors
- [ ] `npm run dev` starts server on http://localhost:5173
- [ ] Backend is accessible (check Network tab in DevTools)
- [ ] All 5 languages can be switched (if i18n is configured)
- [ ] `npm run build` creates `dist/` folder
- [ ] `docker-compose up` works without errors

## QUICK REFERENCE

```powershell
# Development
npm run dev              # http://localhost:5173
npm run type-check       # TypeScript validation
npm run build            # Production build

# Docker
docker-compose up        # Run everything
docker-compose down      # Stop everything

# Troubleshooting
rm -r node_modules
npm install              # Fresh install
npm run type-check       # See errors
```

## NEXT STEPS

1. ✅ Run `INTEGRATE_AND_BUILD.ps1`
2. ✅ Start dev server: `npm run dev`
3. ✅ Check http://localhost:5173
4. ✅ Run type check: `npm run type-check`
5. ✅ Fix any errors (usually import paths)
6. ✅ Build: `npm run build`
7. ✅ Test with Docker: `docker-compose up`

---

**You're now ready to develop!** 🎉

Questions? Check the errors from `npm run type-check` - they'll guide you to what needs fixing.
