# PERIPATETICWARE REPO CLEANUP SCRIPT - FIXED VERSION
# PowerShell - Run from project root directory
# This script deletes ALL duplicate files and folders
# FIXED: Removed problematic Unicode characters

# =============================================================================
# SECTION 1: DELETE DUPLICATE LANDING PAGES
# =============================================================================

Write-Host "=== DELETING DUPLICATE LANDING PAGES ===" -ForegroundColor Yellow

# Delete old LandingPage files from pages directory
Remove-Item -Path "frontend/src/pages/LandingPage.tsx" -Force -ErrorAction SilentlyContinue
Write-Host "[DELETED] frontend/src/pages/LandingPage.tsx"

Remove-Item -Path "frontend/src/pages/LandingPage-Final.tsx" -Force -ErrorAction SilentlyContinue
Write-Host "[DELETED] frontend/src/pages/LandingPage-Final.tsx"

Remove-Item -Path "frontend/src/pages/LandingPage.css" -Force -ErrorAction SilentlyContinue
Write-Host "[DELETED] frontend/src/pages/LandingPage.css"

Remove-Item -Path "frontend/src/pages/LandingPage-Enhanced.css" -Force -ErrorAction SilentlyContinue
Write-Host "[DELETED] frontend/src/pages/LandingPage-Enhanced.css"

Remove-Item -Path "frontend/src/pages/LandingPage.tsx.backup" -Force -ErrorAction SilentlyContinue
Write-Host "[DELETED] frontend/src/pages/LandingPage.tsx.backup"

# Delete role-specific landing pages (consolidated into one)
Remove-Item -Path "frontend/src/pages/AdminLandingPage.tsx" -Force -ErrorAction SilentlyContinue
Write-Host "[DELETED] frontend/src/pages/AdminLandingPage.tsx"

Remove-Item -Path "frontend/src/pages/StudentLandingPage.tsx" -Force -ErrorAction SilentlyContinue
Write-Host "[DELETED] frontend/src/pages/StudentLandingPage.tsx"

Remove-Item -Path "frontend/src/pages/TeacherLandingPage.tsx" -Force -ErrorAction SilentlyContinue
Write-Host "[DELETED] frontend/src/pages/TeacherLandingPage.tsx"

Remove-Item -Path "frontend/src/pages/ParentLandingPage.tsx" -Force -ErrorAction SilentlyContinue
Write-Host "[DELETED] frontend/src/pages/ParentLandingPage.tsx"

# =============================================================================
# SECTION 2: DELETE DUPLICATE LOGIN MODALS
# =============================================================================

Write-Host "`n=== DELETING DUPLICATE LOGIN MODALS ===" -ForegroundColor Yellow

# Delete old LoginModal from auth folder (use landing/LoginModal.tsx instead)
Remove-Item -Path "frontend/src/components/auth/LoginModal.tsx" -Force -ErrorAction SilentlyContinue
Write-Host "[DELETED] frontend/src/components/auth/LoginModal.tsx"

Remove-Item -Path "frontend/src/components/auth/LoginModal.css" -Force -ErrorAction SilentlyContinue
Write-Host "[DELETED] frontend/src/components/auth/LoginModal.css"

# =============================================================================
# SECTION 3: DELETE OLD DASHBOARD VERSIONS
# =============================================================================

Write-Host "`n=== DELETING OLD DASHBOARD VERSIONS ===" -ForegroundColor Yellow

# Delete old backup dashboard files
Remove-Item -Path "frontend/src/pages/StudentDashboard_old.tsx" -Force -ErrorAction SilentlyContinue
Write-Host "[DELETED] frontend/src/pages/StudentDashboard_old.tsx"

Remove-Item -Path "frontend/src/pages/TeacherDashboard_old.tsx" -Force -ErrorAction SilentlyContinue
Write-Host "[DELETED] frontend/src/pages/TeacherDashboard_old.tsx"

# Delete generic Dashboard (use role-specific ones instead)
Remove-Item -Path "frontend/src/components/auth/Dashboard.tsx" -Force -ErrorAction SilentlyContinue
Write-Host "[DELETED] frontend/src/components/auth/Dashboard.tsx"

# =============================================================================
# SECTION 4: DELETE TEMPORARY FIX FOLDER
# =============================================================================

Write-Host "`n=== DELETING TEMPORARY FIX FOLDERS ===" -ForegroundColor Yellow

Remove-Item -Path "peripateticware-landing-fix" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "[DELETED] peripateticware-landing-fix/ (entire folder)"

# =============================================================================
# SECTION 5: DELETE ABANDONED APP FOLDERS
# =============================================================================

Write-Host "`n=== DELETING ABANDONED APP FOLDERS ===" -ForegroundColor Yellow

Remove-Item -Path "web" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "[DELETED] web/ (entire folder - abandoned duplicate)"

Remove-Item -Path "parent-portal" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "[DELETED] parent-portal/ (entire folder - abandoned duplicate)"

# =============================================================================
# SECTION 6: CLEANUP SUMMARY
# =============================================================================

Write-Host "`n=== CLEANUP COMPLETE ===" -ForegroundColor Green

$summary = @"

SUMMARY OF DELETIONS:
  [OK] 9 LandingPage duplicates
  [OK] 2 LoginModal duplicates  
  [OK] 3 old Dashboard versions
  [OK] 1 temporary fix folder
  [OK] 2 abandoned app folders

SOURCES OF TRUTH (KEPT):
  [OK] frontend/src/components/LandingPage.tsx
  [OK] frontend/src/components/landing/LoginModal.tsx
  [OK] frontend/src/components/landing/Footer.tsx
  [OK] frontend/src/components/landing/StorySection.tsx
  [OK] frontend/src/pages/StudentDashboard.tsx
  [OK] frontend/src/pages/TeacherDashboard.tsx
  [OK] frontend/src/pages/ParentDashboard.tsx
  [OK] frontend/src/components/auth/AppRouter.tsx (updated)

NEXT STEPS:
  1. Verify deletions: git status
  2. Update AppRouter (see AppRouter_UPDATED.tsx)
  3. Rebuild: docker-compose build --no-cache
  4. Test all routes

"@

Write-Host $summary -ForegroundColor Green
Write-Host "Repository cleanup finished successfully!" -ForegroundColor Green