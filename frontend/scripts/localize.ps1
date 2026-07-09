# frontend/scripts/localize.ps1
#
# Usage:
#   .\scripts\localize.ps1
#       Original behavior, unchanged: interactive Ollama model picker, then
#       translate_sync.py's own interactive wizard, run against every locale
#       folder under public/locales/.
#
#   .\scripts\localize.ps1 -Model llama3 -Languages "ja,pt-BR,tr,zh"
#       Skips both interactive prompts. Uses the given Ollama model and
#       restricts the translation step to only the listed locale codes
#       (comma-separated, matched against the public/locales/<code>/ folder
#       names — case-insensitive). Every locale's own incremental delta
#       logic still applies, so partially-done locales (e.g. Italian) simply
#       pick up wherever they left off the next time they're included in a
#       -Languages list; they're untouched by a run that omits them.
#
#   .\scripts\localize.ps1 -Provider CLAUDE -Languages "ja,zh"
#       Same idea with a different provider (OLLAMA, CLAUDE, GEMINI, DEEPL,
#       GOOGLE_TRANSLATE, MICROSOFT). -Model only applies to OLLAMA; for
#       other providers set CLAUDE_MODEL / GEMINI_MODEL env vars instead.
#
#   .\scripts\localize.ps1 -Model mistral-nemo:12b -Languages "ja,pt-BR,tr,zh" -Reset
#       Wipes existing translations AND provenance history for ONLY the
#       listed languages first, then retranslates them from scratch with the
#       given model. Locales left out of -Languages (e.g. it, es, fr, ...)
#       are completely untouched — -Reset never affects locales outside the
#       -Languages filter.
param(
    [string]$Model,
    [string]$Languages,
    [ValidateSet("OLLAMA", "CLAUDE", "GEMINI", "DEEPL", "GOOGLE_TRANSLATE", "MICROSOFT")]
    [string]$Provider = "OLLAMA",
    [switch]$Reset
)

$frontendRoot = Split-Path $PSScriptRoot -Parent
Push-Location $frontendRoot

Write-Host "Starting Peripateticware Localization Pipeline..." -ForegroundColor Cyan

# Any of -Model / -Languages / -Provider being explicitly supplied means this
# run should skip both interactive prompts and go straight to translate_sync.py
# with fixed settings instead.
$providerExplicit = $PSBoundParameters.ContainsKey('Provider')
$nonInteractive = [bool]$Model -or [bool]$Languages -or $providerExplicit -or $Reset

if ($Languages) {
    Write-Host "Restricting this run to languages: $Languages" -ForegroundColor Cyan
}
if ($Reset) {
    if (-not $Languages) {
        Write-Host "WARNING: -Reset with no -Languages filter will wipe EVERY locale. Pass -Languages to scope this to specific languages." -ForegroundColor Red
    } else {
        Write-Host "Wiping existing translations first for: $Languages" -ForegroundColor Yellow
    }
}

# --- Ollama model selection ---
if ($Provider -eq "OLLAMA") {
    if ($Model) {
        $selectedModel = $Model
        Write-Host "Using model: $selectedModel" -ForegroundColor Green
    } else {
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
    }
    $env:OLLAMA_MODEL_TEXT = $selectedModel
} elseif ($Model) {
    Write-Host "Provider is $Provider - ignoring -Model '$Model' (set CLAUDE_MODEL / GEMINI_MODEL env vars instead if needed)." -ForegroundColor Yellow
}

# 1. Tag raw text in the codebase
node scripts/ast_tagger.cjs

# 2. Extract keys to en/landing.json
npm run i18n:extract

# 3. Translate and build W3C PROV XLIFF documents
#    (translate_sync.py also runs the namespace sync internally as its final step)
$translateArgs = @("scripts/translate_sync.py")
if ($nonInteractive) {
    $translateArgs += @("--non-interactive", "--provider", $Provider)
}
if ($Languages) {
    $translateArgs += @("--languages", $Languages)
}
if ($Reset) {
    $translateArgs += "--reset"
}
python @translateArgs

# 4. Distribute root flat locale files into i18next namespace subdirectories.
#    Runs here explicitly as a safety net in case translate_sync.py exited early.
#    Only writes keys that differ from English (override pattern — no duplication).
Write-Host "`nRunning namespace sync..." -ForegroundColor Cyan
python scripts/sync_locales.py

Pop-Location

Write-Host "Localization pipeline complete!" -ForegroundColor Green
