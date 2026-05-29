# ============================================================================
# FIX EXPORT/IMPORT MISMATCHES - PERIPATETICWARE
# ============================================================================
# Save as: fix-exports.ps1
# Run from project root: .\fix-exports.ps1
# ============================================================================

Write-Host "`n" -ForegroundColor Cyan
Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   FIXING EXPORT/IMPORT MISMATCHES                      ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$frontendPath = "./frontend"

# ============================================================================
# FIX 1: App.tsx Imports
# ============================================================================

Write-Host "Step 1: Fixing App.tsx imports..." -ForegroundColor Yellow

$appPath = "$frontendPath/src/App.tsx"

if (Test-Path $appPath) {
    $content = Get-Content $appPath -Raw
    
    # Replace named imports with default imports
    $content = $content -replace 'import\s+{\s*ActivityListPage\s*}\s+from', 'import ActivityListPage from'
    $content = $content -replace 'import\s+{\s*ActivityDetailPage\s*}\s+from', 'import ActivityDetailPage from'
    $content = $content -replace 'import\s+{\s*ProjectsPage\s*}\s+from', 'import ProjectsPage from'
    $content = $content -replace 'import\s+{\s*ProjectDetailPage\s*}\s+from', 'import ProjectDetailPage from'
    $content = $content -replace 'import\s+{\s*StudentHowItWorksPage\s*}\s+from', 'import StudentHowItWorksPage from'
    $content = $content -replace 'import\s+{\s*ParentFeaturesPage\s*}\s+from', 'import ParentFeaturesPage from'
    
    Set-Content $appPath $content
    Write-Host "  [OK] Fixed App.tsx imports" -ForegroundColor Green
}
else {
    Write-Host "  [ERROR] App.tsx not found at $appPath" -ForegroundColor Red
}

# ============================================================================
# FIX 2: Create Missing Locale File
# ============================================================================

Write-Host "`nStep 2: Creating locale file..." -ForegroundColor Yellow

$localeDir = "$frontendPath/src/locales/en"
$localeFile = "$localeDir/en.json"

if (-not (Test-Path $localeDir)) {
    New-Item -ItemType Directory -Path $localeDir -Force | Out-Null
}

$localeContent = @'
{
  "common": {
    "appName": "Peripateticware",
    "home": "Home",
    "login": "Login",
    "logout": "Logout",
    "signup": "Sign Up"
  },
  "student": {
    "dashboard": "Student Dashboard",
    "projects": "My Projects",
    "activities": "Activities"
  },
  "teacher": {
    "dashboard": "Teacher Dashboard",
    "projects": "Projects",
    "activities": "Activities"
  },
  "parent": {
    "dashboard": "Parent Dashboard",
    "features": "Features"
  }
}
'@

Set-Content $localeFile $localeContent
Write-Host "  [OK] Created: src/locales/en/en.json" -ForegroundColor Green

# ============================================================================
# FIX 3: Create Missing Auth Store
# ============================================================================

Write-Host "`nStep 3: Creating auth store..." -ForegroundColor Yellow

$storeDir = "$frontendPath/src/stores"
$authFile = "$storeDir/auth.ts"

if (-not (Test-Path $storeDir)) {
    New-Item -ItemType Directory -Path $storeDir -Force | Out-Null
}

$authStoreContent = @'
import { create } from 'zustand';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setToken: (token) => set({ token }),
  logout: () => set({ user: null, token: null, isAuthenticated: false }),
}));
'@

Set-Content $authFile $authStoreContent
Write-Host "  [OK] Created: src/stores/auth.ts" -ForegroundColor Green

# ============================================================================
# FIX 4: Create Missing useAuth Hook
# ============================================================================

Write-Host "`nStep 4: Creating useAuth hook..." -ForegroundColor Yellow

$hooksDir = "$frontendPath/src/hooks"
$authHookFile = "$hooksDir/useAuth.ts"

if (-not (Test-Path $hooksDir)) {
    New-Item -ItemType Directory -Path $hooksDir -Force | Out-Null
}

$authHookContent = @'
import { useAuthStore } from '@/stores/auth';

export const useAuth = () => {
  const { user, token, isAuthenticated, setUser, setToken, logout } = useAuthStore();

  return {
    user,
    token,
    isAuthenticated,
    setUser,
    setToken,
    logout,
  };
};
'@

Set-Content $authHookFile $authHookContent
Write-Host "  [OK] Created: src/hooks/useAuth.ts" -ForegroundColor Green

# ============================================================================
# FIX 5: Check Page Components
# ============================================================================

Write-Host "`nStep 5: Checking page components..." -ForegroundColor Yellow

$pageFiles = @(
    "$frontendPath/src/pages/teacher/ActivityListPage.tsx",
    "$frontendPath/src/pages/teacher/ActivityDetailPage.tsx",
    "$frontendPath/src/pages/teacher/ProjectsPage.tsx",
    "$frontendPath/src/pages/teacher/ProjectDetailPage.tsx",
    "$frontendPath/src/pages/student/StudentHowItWorksPage.tsx",
    "$frontendPath/src/pages/parent/ParentFeaturesPage.tsx"
)

$foundCount = 0
foreach ($file in $pageFiles) {
    if (Test-Path $file) {
        $fileName = Split-Path $file -Leaf
        Write-Host "  [OK] Found: $fileName" -ForegroundColor Green
        $foundCount++
    }
    else {
        $fileName = Split-Path $file -Leaf
        Write-Host "  [MISSING] $fileName" -ForegroundColor Yellow
    }
}

# ============================================================================
# SUMMARY
# ============================================================================

Write-Host "`n" -ForegroundColor Cyan
Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   FIXES COMPLETE!                                      ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Restart Docker:" -ForegroundColor White
Write-Host "   docker-compose restart frontend" -ForegroundColor Cyan
Write-Host ""

Write-Host "2. Watch logs:" -ForegroundColor White
Write-Host "   docker-compose logs -f frontend" -ForegroundColor Cyan
Write-Host ""

Write-Host "3. Visit:" -ForegroundColor White
Write-Host "   http://localhost:3000" -ForegroundColor Cyan
Write-Host ""

Write-Host "Done! Your import errors should be fixed." -ForegroundColor Green
Write-Host ""