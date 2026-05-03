

Write-Host "==========================================" -ForegroundColor Yellow
Write-Host "Peripateticware Database Initialization" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host ""

# Configuration
$API_BASE = "http://localhost:8000/api/v1"
$Users = @(
    @{
        email = "teacher@example.com"
        username = "teachertest"
        password = "SecurePassword123"
        full_name = "Jane Smith"
        role = "teacher"
    },
    @{
        email = "student@example.com"
        username = "studenttest"
        password = "SecurePassword123"
        full_name = "Alex Johnson"
        role = "student"
    },
    @{
        email = "parent@example.com"
        username = "parenttest"
        password = "SecurePassword123"
        full_name = "Maria Garcia"
        role = "parent"
    }
)

# Color functions
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-ErrorMsg { Write-Host $args -ForegroundColor Red }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }

# Step 1: Check if API is running
Write-Info "[*] Checking if API server is running..."
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -ErrorAction Stop
    Write-Success "[OK] API server is running!"
} catch {
    Write-ErrorMsg "[ERROR] API server is not running!"
    Write-Info "Start Docker with: docker-compose up -d"
    exit 1
}

Write-Host ""

# Step 2: Register users
Write-Info "[*] Registering test users..."
$successCount = 0
$failureCount = 0

foreach ($user in $Users) {
    Write-Host ""
    Write-Info "Registering $($user.role): $($user.email)..."
    
    try {
        $registerBody = @{
            email = $user.email
            username = $user.username
            password = $user.password
            full_name = $user.full_name
            role = $user.role
        } | ConvertTo-Json
        
        $response = Invoke-WebRequest -Uri "$API_BASE/auth/register" `
            -Method Post `
            -ContentType "application/json" `
            -Body $registerBody `
            -ErrorAction SilentlyContinue
        
        if ($response.StatusCode -eq 201) {
            $data = $response.Content | ConvertFrom-Json
            Write-Success "[OK] $($user.role.ToUpper()) registered successfully!"
            Write-Info "  Email: $($user.email)"
            Write-Info "  User ID: $($data.user_id)"
            $successCount++
        } else {
            Write-Warning "[WARN] Unexpected status code: $($response.StatusCode)"
            $failureCount++
        }
    } catch {
        $errorMsg = $_.Exception.Response.StatusCode
        if ($errorMsg -eq "BadRequest" -or $errorMsg -eq 400) {
            Write-Warning "[WARN] User may already exist: $($user.email)"
            $successCount++
        } else {
            Write-ErrorMsg "[ERROR] Failed to register $($user.email)"
            Write-ErrorMsg "  Error: $($_.Exception.Message)"
            $failureCount++
        }
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host "Registration Summary" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Yellow
Write-Success "Successful: $successCount/3"
Write-ErrorMsg "Failed: $failureCount/3"
Write-Host ""

if ($successCount -ge 3 -or ($successCount + $failureCount) -ge 3) {
    Write-Success "[SUCCESS] Database initialization complete!"
    Write-Info ""
    Write-Info "You can now login with:"
    Write-Info "  Teacher: teacher@example.com / SecurePassword123"
    Write-Info "  Student: student@example.com / SecurePassword123"
    Write-Info "  Parent:  parent@example.com / SecurePassword123"
    Write-Host ""
    Write-Info "Run the test script:"
    Write-Info "  .\test-api-endpoints-all-roles.ps1"
} else {
    Write-ErrorMsg "[ERROR] Database initialization failed!"
    Write-Info "Check the API logs: docker-compose logs -f fastapi"
    exit 1
}