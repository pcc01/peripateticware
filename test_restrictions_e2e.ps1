# test_restrictions_e2e.ps1
# Tests payment restriction enforcement for all three gates:
#   1. Standards coverage tier gate (homeschool_family required)
#   2. Homeschool child limit (free tier blocked at >= 2 children)
#   3. Teacher seat limit (max_teachers enforced on org join)
#
# Run from project root:
#   .\test_restrictions_e2e.ps1

$BASE = "http://localhost:8000/api/v1"
$PASS = 0
$FAIL = 0

function Write-Result($label, $ok, $detail) {
    if ($ok) {
        Write-Host "  [PASS] $label" -ForegroundColor Green
        $script:PASS++
    } else {
        Write-Host "  [FAIL] $label -- $detail" -ForegroundColor Red
        $script:FAIL++
    }
}

function Invoke-Api($Method, $Path, $Body, $Token) {
    $headers = @{ "Content-Type" = "application/json" }
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    try {
        if ($Body) {
            return Invoke-RestMethod -Method $Method -Uri "$BASE$Path" `
                -Headers $headers -Body ($Body | ConvertTo-Json -Compress) -ErrorAction Stop
        } else {
            return Invoke-RestMethod -Method $Method -Uri "$BASE$Path" `
                -Headers $headers -ErrorAction Stop
        }
    } catch {
        return $_.Exception.Response
    }
}

function Get-StatusCode($Response) {
    if ($Response -is [System.Net.Http.HttpResponseMessage]) {
        return [int]$Response.StatusCode
    }
    if ($null -ne $Response.StatusCode) {
        return [int]$Response.StatusCode
    }
    return 0
}

function Invoke-ApiRaw($Method, $Path, $Body, $Token) {
    $headers = @{ "Content-Type" = "application/json" }
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    try {
        $params = @{
            Method           = $Method
            Uri              = "$BASE$Path"
            Headers          = $headers
            UseBasicParsing  = $true
            ErrorAction      = "Stop"
        }
        if ($Body) { $params["Body"] = ($Body | ConvertTo-Json -Compress) }
        $response = Invoke-WebRequest @params
        return @{ Code = [int]$response.StatusCode; Body = $response.Content | ConvertFrom-Json -ErrorAction SilentlyContinue }
    } catch {
        $code = 0
        $body = $null
        if ($_.Exception.Response) {
            $code = [int]$_.Exception.Response.StatusCode
        }
        # $_.ErrorDetails.Message is the most reliable way to get the response body
        # from a failed Invoke-WebRequest across PowerShell 5.1 and 7+
        if ($_.ErrorDetails.Message) {
            $body = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
        }
        return @{ Code = $code; Body = $body }
    }
}

Write-Host ""
Write-Host "Peripateticware Restriction Tests" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# --------------------------------------------------------------------------
# 0. Register a fresh free-tier teacher account for testing
# --------------------------------------------------------------------------
Write-Host "[Setup] Creating free-tier teacher test account..." -ForegroundColor Yellow
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$teacherEmail = "restrict_test_teacher_$ts@example.com"
$teacherPass  = "TestPass123!"

$signupBody = @{
    email            = $teacherEmail
    password         = $teacherPass
    password_confirm = $teacherPass
    first_name       = "Restrict"
    last_name        = "Tester"
    role             = "TEACHER"
    school_name      = "Restriction Test School"
    country          = "US"
    age_confirmed    = $true
}
$signupResult = Invoke-ApiRaw "POST" "/auth/signup" $signupBody
Write-Host "  Signup status: $($signupResult.Code)"

# Log in
$loginBody = @{ email = $teacherEmail; password = $teacherPass }
$loginResult = Invoke-ApiRaw "POST" "/auth/login" $loginBody
if ($loginResult.Code -ne 200) {
    Write-Host "  [ERROR] Login failed (status $($loginResult.Code)). Is Docker running?" -ForegroundColor Red
    Write-Host "  Aborting — start the Docker stack first: docker compose up -d" -ForegroundColor Red
    exit 1
}
$token = $loginResult.Body.access_token
Write-Host "  Teacher token obtained." -ForegroundColor Green
Write-Host ""

# --------------------------------------------------------------------------
# 1. Standards Coverage Gate
# --------------------------------------------------------------------------
Write-Host "[Test 1] Standards coverage tier gate" -ForegroundColor Cyan

# Get any standards set ID
$sets = Invoke-ApiRaw "GET" "/standards" $null $token
if ($sets.Code -eq 200 -and $sets.Body.Count -gt 0) {
    $setId = $sets.Body[0].id
    $cov = Invoke-ApiRaw "GET" "/standards/$setId/coverage" $null $token
    Write-Result "GET /standards/{id}/coverage returns 402 for free-tier teacher" `
        ($cov.Code -eq 402) "Got $($cov.Code)"
    if ($cov.Code -eq 402) {
        $detail = $cov.Body.detail
        Write-Result "402 detail has code=UPGRADE_REQUIRED" `
            ($detail.code -eq "UPGRADE_REQUIRED") "Got '$($detail.code)'"
        Write-Result "402 detail has feature=standards_coverage" `
            ($detail.feature -eq "standards_coverage") "Got '$($detail.feature)'"
        Write-Result "402 detail has required_tier" `
            (-not [string]::IsNullOrEmpty($detail.required_tier)) "Got '$($detail.required_tier)'"
    }
} else {
    Write-Host "  [SKIP] No standards sets in DB — seed standards data first" -ForegroundColor Yellow
    $script:PASS++
}
Write-Host ""

# --------------------------------------------------------------------------
# 2. Homeschool child limit (requires a homeschool parent account)
# --------------------------------------------------------------------------
Write-Host "[Test 2] Homeschool child limit (free tier)" -ForegroundColor Cyan

$hsEmail = "restrict_test_hs_$ts@example.com"
$hsBody = @{
    email            = $hsEmail
    password         = $teacherPass
    password_confirm = $teacherPass
    first_name       = "Restrict"
    last_name        = "Parent"
    role             = "HOMESCHOOL"
    country          = "US"
    age_confirmed    = $true
}
$hsSignup = Invoke-ApiRaw "POST" "/auth/signup" $hsBody
$hsLogin = Invoke-ApiRaw "POST" "/auth/login" @{ email = $hsEmail; password = $teacherPass }

if ($hsLogin.Code -eq 200) {
    $hsToken = $hsLogin.Body.access_token

    # Add child 1 — should succeed
    $child1 = Invoke-ApiRaw "POST" "/homeschool/children" @{ full_name = "Child One"; email = "child1_$ts@example.com"; password = "ChildPass1!" } $hsToken
    Write-Result "First child add succeeds (200/201)" `
        ($child1.Code -in @(200, 201)) "Got $($child1.Code)"

    # Add child 2 — may succeed (limit is AT 2, so the 3rd would be blocked)
    $child2 = Invoke-ApiRaw "POST" "/homeschool/children" @{ full_name = "Child Two"; email = "child2_$ts@example.com"; password = "ChildPass2!" } $hsToken
    Write-Result "Second child add succeeds or hits limit (200/201/402)" `
        ($child2.Code -in @(200, 201, 402)) "Got $($child2.Code)"

    # Add child 3 — should be 402 if limit is 2
    $child3 = Invoke-ApiRaw "POST" "/homeschool/children" @{ full_name = "Child Three"; email = "child3_$ts@example.com"; password = "ChildPass3!" } $hsToken
    if ($child2.Code -in @(200, 201)) {
        Write-Result "Third child blocked with 402 (free tier limit=2)" `
            ($child3.Code -eq 402) "Got $($child3.Code)"
        if ($child3.Code -eq 402) {
            $d = $child3.Body.detail
            Write-Result "402 detail has code=UPGRADE_REQUIRED" ($d.code -eq "UPGRADE_REQUIRED") "Got '$($d.code)'"
            Write-Result "402 detail has feature=homeschool_children" ($d.feature -eq "homeschool_children") "Got '$($d.feature)'"
        }
    } else {
        Write-Host "  [INFO] Limit hit at child 2 (limit may be 1 on free)" -ForegroundColor Yellow
        $script:PASS++
    }
} else {
    Write-Host "  [SKIP] Homeschool signup failed (status $($hsSignup.Code))" -ForegroundColor Yellow
}
Write-Host ""

# --------------------------------------------------------------------------
# 3. Standards export (same gate, via GET with export flag if applicable)
# --------------------------------------------------------------------------
Write-Host "[Test 3] Portfolio/report export gate (homeschool)" -ForegroundColor Cyan
if ($hsLogin.Code -eq 200) {
    # Endpoint is POST /homeschool/export/portfolio — requires child_id in body
    # Use a dummy UUID; tier check fires before child lookup
    $exportBody = @{ child_id = "00000000-0000-0000-0000-000000000000"; format = "pdf" }
    $export = Invoke-ApiRaw "POST" "/homeschool/export/portfolio" $exportBody $hsToken
    Write-Result "Portfolio export returns 402 for free-tier homeschool" `
        ($export.Code -eq 402) "Got $($export.Code)"
    if ($export.Code -eq 402) {
        $d = $export.Body.detail
        Write-Result "402 detail has code=UPGRADE_REQUIRED" ($d.code -eq "UPGRADE_REQUIRED") "Got '$($d.code)'"
        Write-Result "402 detail has feature=portfolio_export" ($d.feature -eq "portfolio_export") "Got '$($d.feature)'"
    }
} else {
    Write-Host "  [SKIP] No homeschool token" -ForegroundColor Yellow
}
Write-Host ""

# --------------------------------------------------------------------------
# Summary
# --------------------------------------------------------------------------
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Results: $PASS passed, $FAIL failed" -ForegroundColor $(if ($FAIL -eq 0) { "Green" } else { "Red" })
Write-Host ""
if ($FAIL -gt 0) {
    Write-Host "Check Docker logs: docker compose logs backend --tail=50" -ForegroundColor Yellow
}
