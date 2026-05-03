# Peripateticware API Comprehensive Testing Script
# Tests all user roles: Teacher, Student, Parent
# Usage: .\test-api-endpoints-all-roles.ps1

# Configuration
$API_BASE = "http://localhost:8000/api/v1"
$TEST_RESULTS = @()

# Test users with different roles
$TestUsers = @(
    @{
        role = "teacher"
        email = "teacher@example.com"
        password = "SecurePassword123"
        endpoints = @("/auth/me", "/teacher/activities")
    },
    @{
        role = "student"
        email = "student@example.com"
        password = "SecurePassword123"
        endpoints = @("/auth/me", "/sessions")
    },
    @{
        role = "parent"
        email = "parent@example.com"
        password = "SecurePassword123"
        endpoints = @("/auth/me", "/parent")
    }
)

# Color functions
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-ErrorMsg { Write-Host $args -ForegroundColor Red }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Header { 
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host $args -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow 
}

# Test result tracker
function Track-Result {
    param(
        [string]$Role,
        [string]$Endpoint,
        [string]$Method,
        [int]$ExpectedCode,
        [int]$ActualCode,
        [decimal]$ResponseTime
    )
    
    $status = if ($ActualCode -eq $ExpectedCode) { "[PASS]" } else { "[FAIL]" }
    $color = if ($status -like "*PASS*") { "Green" } else { "Red" }
    
    $result = @{
        Role = $Role
        Endpoint = $Endpoint
        Method = $Method
        Expected = $ExpectedCode
        Actual = $ActualCode
        Status = $status
        Time = $ResponseTime
    }
    
    $TEST_RESULTS += $result
    Write-Host ("{0} [{1}] {2} {3} - Expected {4}, Got {5} ({6}ms)" -f $status, $Role.ToUpper(), $Method, $Endpoint, $ExpectedCode, $ActualCode, $ResponseTime) -ForegroundColor $color
}

# Helper function to make API call
function Invoke-APICall {
    param(
        [string]$Method,
        [string]$Endpoint,
        [string]$Token,
        [hashtable]$Body = $null,
        [int]$ExpectedCode = 200
    )
    
    $url = "$API_BASE$Endpoint"
    $headers = @{
        "Authorization" = "Bearer $Token"
        "Content-Type" = "application/json"
    }
    
    try {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        
        $params = @{
            Uri = $url
            Method = $Method
            Headers = $headers
            ErrorAction = "SilentlyContinue"
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-WebRequest @params
        $sw.Stop()
        
        return @{
            StatusCode = $response.StatusCode
            Content = $response.Content | ConvertFrom-Json
            Time = $sw.ElapsedMilliseconds
        }
    }
    catch {
        $sw.Stop()
        $statusCode = [int]($_.Exception.Response.StatusCode)
        
        return @{
            StatusCode = $statusCode
            Content = $null
            Time = $sw.ElapsedMilliseconds
            Error = $_.Exception.Message
        }
    }
}

# ============================================================================
# MAIN TESTING
# ============================================================================

Write-Header "Peripateticware Comprehensive API Testing"
Write-Info "Testing all user roles: Teacher, Student, Parent"
Write-Host ""

# Check if API is running
Write-Info "[*] Checking if API server is running..."
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -ErrorAction Stop
    Write-Success "[OK] API server is running!"
} catch {
    Write-ErrorMsg "[ERROR] API server is not running."
    Write-Info "Run: docker-compose up -d"
    exit 1
}

Write-Host ""

# Test each user role
foreach ($user in $TestUsers) {
    Write-Header "Testing $($user.role.ToUpper()) Role"
    
    # Step 1: Login
    Write-Info "Step 1: Authenticating as $($user.role)..."
    
    try {
        $loginBody = @{
            email = $user.email
            password = $user.password
        } | ConvertTo-Json
        
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $response = Invoke-WebRequest -Uri "$API_BASE/auth/login" `
            -Method Post `
            -ContentType "application/json" `
            -Body $loginBody `
            -ErrorAction SilentlyContinue
        $sw.Stop()
        
        if ($response.StatusCode -eq 200) {
            $data = $response.Content | ConvertFrom-Json
            $token = $data.access_token
            
            Write-Success "[OK] Login successful!"
            Write-Info "  Email: $($user.email)"
            Write-Info "  Role: $($user.role)"
            Write-Info "  Response time: $($sw.ElapsedMilliseconds)ms"
            
            Track-Result -Role $user.role -Endpoint "/auth/login" -Method "POST" -ExpectedCode 200 -ActualCode 200 -ResponseTime $sw.ElapsedMilliseconds
        } else {
            Write-ErrorMsg "[ERROR] Login failed with status $($response.StatusCode)"
            Track-Result -Role $user.role -Endpoint "/auth/login" -Method "POST" -ExpectedCode 200 -ActualCode $response.StatusCode -ResponseTime $sw.ElapsedMilliseconds
            continue
        }
    } catch {
        Write-ErrorMsg "[ERROR] Login exception: $($_.Exception.Message)"
        Track-Result -Role $user.role -Endpoint "/auth/login" -Method "POST" -ExpectedCode 200 -ActualCode 500 -ResponseTime 0
        continue
    }
    
    Write-Host ""
    
    # Step 2: Test user info endpoint
    Write-Info "Step 2: Testing user info endpoint..."
    $meResult = Invoke-APICall -Method "GET" -Endpoint "/auth/me" -Token $token -ExpectedCode 200
    
    if ($meResult.StatusCode -eq 200) {
        Write-Success "[OK] User info retrieved"
        Write-Info "  User ID: $($meResult.Content.user_id)"
        Write-Info "  Email: $($meResult.Content.email)"
        Write-Info "  Response time: $($meResult.Time)ms"
        Track-Result -Role $user.role -Endpoint "/auth/me" -Method "GET" -ExpectedCode 200 -ActualCode 200 -ResponseTime $meResult.Time
    } else {
        Write-ErrorMsg "[ERROR] Failed to get user info"
        Track-Result -Role $user.role -Endpoint "/auth/me" -Method "GET" -ExpectedCode 200 -ActualCode $meResult.StatusCode -ResponseTime $meResult.Time
    }
    
    Write-Host ""
    
    # Step 3: Test role-specific endpoints
    Write-Info "Step 3: Testing role-specific endpoints..."
    
    foreach ($endpoint in $user.endpoints) {
        if ($endpoint -eq "/auth/me") {
            # Already tested above
            continue
        }
        
        Write-Info "  Testing: $endpoint"
        $endpointResult = Invoke-APICall -Method "GET" -Endpoint $endpoint -Token $token
        
        if ($endpointResult.StatusCode -eq 200 -or $endpointResult.StatusCode -eq 201) {
            Write-Success "    [OK] Status $($endpointResult.StatusCode) - Response time: $($endpointResult.Time)ms"
            Track-Result -Role $user.role -Endpoint $endpoint -Method "GET" -ExpectedCode 200 -ActualCode $endpointResult.StatusCode -ResponseTime $endpointResult.Time
        } else {
            # Some endpoints might return 404 if empty, which is OK
            if ($endpointResult.StatusCode -eq 404 -or $endpointResult.StatusCode -eq 403) {
                Write-Info "    [WARN] Status $($endpointResult.StatusCode) - Expected for new user"
                Track-Result -Role $user.role -Endpoint $endpoint -Method "GET" -ExpectedCode 200 -ActualCode $endpointResult.StatusCode -ResponseTime $endpointResult.Time
            } else {
                Write-ErrorMsg "    [ERROR] Status $($endpointResult.StatusCode)"
                Track-Result -Role $user.role -Endpoint $endpoint -Method "GET" -ExpectedCode 200 -ActualCode $endpointResult.StatusCode -ResponseTime $endpointResult.Time
            }
        }
    }
    
    Write-Host ""
}

# Summary
Write-Header "Test Summary"

$passed = ($TEST_RESULTS | Where-Object { $_.Status -like "*PASS*" }).Count
$failed = ($TEST_RESULTS | Where-Object { $_.Status -like "*FAIL*" }).Count
$total = $TEST_RESULTS.Count

Write-Info "Total Tests: $total"
Write-Success "Passed: $passed"
Write-ErrorMsg "Failed: $failed"
Write-Host ""

# Results by role
Write-Header "Results by Role"

$roles = $TEST_RESULTS | Select-Object -ExpandProperty Role -Unique
foreach ($role in $roles) {
    $roleTests = $TEST_RESULTS | Where-Object { $_.Role -eq $role }
    $rolePassed = ($roleTests | Where-Object { $_.Status -like "*PASS*" }).Count
    $roleTotal = $roleTests.Count
    
    Write-Info "$($role.ToUpper()): $rolePassed/$roleTotal passed"
}

Write-Host ""
Write-Header "Detailed Results"

$TEST_RESULTS | Format-Table -AutoSize @(
    @{Label="Role"; Expression={$_.Role}},
    @{Label="Endpoint"; Expression={$_.Endpoint}},
    @{Label="Method"; Expression={$_.Method}},
    @{Label="Status"; Expression={$_.Status}},
    @{Label="Expected"; Expression={$_.Expected}},
    @{Label="Actual"; Expression={$_.Actual}},
    @{Label="Time(ms)"; Expression={$_.Time}}
)

Write-Host ""

if ($failed -eq 0) {
    Write-Success "[SUCCESS] All tests passed! System is ready!"
} else {
    Write-ErrorMsg "[WARNING] Some tests failed. Check above for details."
}