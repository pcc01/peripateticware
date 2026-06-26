Write-Host "=== NUCLEAR REBUILD ==="

# Step 1: Kill everything
Write-Host "Stopping all..."
docker-compose down -v
docker system prune -f --volumes
Start-Sleep 2

# Step 2: Delete node_modules and dist
Write-Host "Cleaning frontend..."
Remove-Item frontend/node_modules -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item frontend/dist -Recurse -Force -ErrorAction SilentlyContinue

# Step 3: Copy clean files
Write-Host "Copying files..."
Copy-Item LandingPage-Final.tsx frontend/src/pages/LandingPage.tsx -Force
Copy-Item LandingPage.css frontend/src/pages/LandingPage.css -Force

# Step 4: Fresh npm install
Write-Host "Fresh npm install..."
Set-Location frontend
npm install --legacy-peer-deps 2>&1 | Out-Null
npm run build 2>&1 | Out-Null
Set-Location ..

# Step 5: Docker rebuild
Write-Host "Docker rebuild (2-3 min)..."
docker-compose build --no-cache --pull 2>&1 | Out-Null
docker-compose up -d 2>&1 | Out-Null
Start-Sleep 20

Write-Host ""
Write-Host "COMPLETE!"
Write-Host ""
Write-Host "Then in browser:"
Write-Host "1. Go to http://localhost:5173"
Write-Host "2. Press F12"
Write-Host "3. Right-click reload button > Empty cache and hard refresh"
Write-Host "4. Or: Ctrl+Shift+Delete then Ctrl+Shift+R"