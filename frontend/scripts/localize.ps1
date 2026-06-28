# frontend/scripts/localize.ps1
$frontendRoot = Split-Path $PSScriptRoot -Parent
Push-Location $frontendRoot

Write-Host "Starting Peripateticware Localization Pipeline..." -ForegroundColor Cyan

# --- Ollama model selection ---
Write-Host "`nQuerying installed Ollama models..." -ForegroundColor Cyan
try {
    $ollamaList = ollama list 2>&1
    # Parse model names from 'ollama list' output (skip header line, grab first column)
    $models = $ollamaList | Select-Object -Skip 1 | ForEach-Object {
        ($_ -split '\s+')[0]
    } | Where-Object { $_ -ne "" }
} catch {
    $models = @()
}

if ($models.Count -eq 0) {
    Write-Host "No installed Ollama models found. Enter the model name to use:" -ForegroundColor Yellow
    $selectedModel = Read-Host "Model name [e.g. llama3, phi3, gemma2]"
    if (-not $selectedModel) { $selectedModel = "mistral" }
} elseif ($models.Count -eq 1) {
    $selectedModel = $models[0]
    Write-Host "Using model: $selectedModel" -ForegroundColor Green
} else {
    Write-Host "`nInstalled Ollama models:" -ForegroundColor Cyan
    for ($i = 0; $i -lt $models.Count; $i++) {
        Write-Host "  [$($i + 1)] $($models[$i])"
    }
    $choice = Read-Host "Select model number [default: 1]"
    $choiceInt = $choice -as [int]
    if ($choiceInt -ge 1 -and $choiceInt -le $models.Count) {
        $selectedModel = $models[$choiceInt - 1]
    } else {
        $selectedModel = $models[0]
    }
    Write-Host "Using model: $selectedModel" -ForegroundColor Green
}

$env:OLLAMA_MODEL_TEXT = $selectedModel

# 1. Tag raw text in the codebase
node scripts/ast_tagger.cjs

# 2. Extract keys to en/landing.json
npm run i18n:extract

# 3. Translate and build W3C PROV XLIFF documents
#    (translate_sync.py also runs the namespace sync internally as its final step)
python scripts/translate_sync.py

# 4. Distribute root flat locale files into i18next namespace subdirectories.
#    Runs here explicitly as a safety net in case translate_sync.py exited early.
#    Only writes keys that differ from English (override pattern — no duplication).
Write-Host "`nRunning namespace sync..." -ForegroundColor Cyan
python scripts/sync_locales.py

Pop-Location

Write-Host "Localization pipeline complete!" -ForegroundColor Green
