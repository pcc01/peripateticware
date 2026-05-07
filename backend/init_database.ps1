# PowerShell Database Initialization Script
# Run from project root

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Peripateticware DB Init" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Cyan

# Step 1: Initialize database
Write-Host "" 
Write-Host "Step 1 of 2: Creating base tables from SQLAlchemy models..." -ForegroundColor Yellow
docker-compose exec fastapi python backend/init_db.py

if ($LASTEXITCODE -ne 0) {
    Write-Host "Database initialization failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Base tables created!" -ForegroundColor Green

# Step 2: Run migrations
Write-Host ""
Write-Host "Step 2 of 2: Running alembic migrations..." -ForegroundColor Yellow
docker-compose exec fastapi alembic upgrade head

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "ALL DONE! Database is ready!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verify discovery columns were added:" -ForegroundColor Cyan
    docker-compose exec postgres psql -U postgres -d peripateticware -c "SELECT column_name FROM information_schema.columns WHERE table_name='activities' AND column_name LIKE 'discovery%' ORDER BY column_name;"
    Write-Host ""
    Write-Host "Setup Complete!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Migration failed!" -ForegroundColor Red
    exit 1
}