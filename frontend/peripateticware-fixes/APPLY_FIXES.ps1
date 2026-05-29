# Peripateticware Frontend TypeScript Fixes
# Run this from your frontend directory

Write-Host "🔧 Applying TypeScript fixes..." -ForegroundColor Cyan
Write-Host ""

# 1. Fix constants.ts
Write-Host "1️⃣  Installing constants.ts..." -ForegroundColor Yellow
Copy-Item "constants.ts" "src/config/constants.ts" -Force
Write-Host "✓ Done" -ForegroundColor Green

# 2. Fix ProtectedRoute.tsx
Write-Host "2️⃣  Installing ProtectedRoute.tsx..." -ForegroundColor Yellow
Copy-Item "ProtectedRoute.tsx" "src/components/auth/ProtectedRoute.tsx" -Force
Write-Host "✓ Done" -ForegroundColor Green

# 3. Replace all lowercase role strings with UPPERCASE
Write-Host "3️⃣  Replacing lowercase role strings..." -ForegroundColor Yellow

$files = Get-ChildItem src -Recurse -Include "*.tsx", "*.ts" -Exclude "*.test.tsx"
$count = 0

foreach ($file in $files) {
  $content = Get-Content $file.FullName -Raw
  $original = $content
  
  $content = $content -replace "'student'", "'STUDENT'"
  $content = $content -replace "'teacher'", "'TEACHER'"
  $content = $content -replace "'parent'", "'PARENT'"
  $content = $content -replace "'admin'", "'ADMIN'"
  $content = $content -replace '"student"', '"STUDENT"'
  $content = $content -replace '"teacher"', '"TEACHER"'
  $content = $content -replace '"parent"', '"PARENT"'
  $content = $content -replace '"admin"', '"ADMIN"'
  
  if ($content -ne $original) {
    Set-Content $file.FullName $content
    $count++
  }
}

Write-Host "✓ Fixed $count files" -ForegroundColor Green

Write-Host ""
Write-Host "✅ All fixes applied!" -ForegroundColor Green
Write-Host ""
Write-Host "Next: npm run type-check" -ForegroundColor Cyan
Write-Host ""
