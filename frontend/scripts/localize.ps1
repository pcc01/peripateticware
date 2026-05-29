# frontend/scripts/localize.ps1
Write-Host "🤖 Starting Peripateticware Localization Pipeline..." -ForegroundColor Cyan

# 1. Tag raw text in the codebase
node scripts/ast_tagger.cjs

# 2. Extract keys to en/landing.json
npx i18next

# 3. Translate and build W3C PROV XLIFF documents
python scripts/translate_sync.py

Write-Host "✨ Localization pipeline complete!" -ForegroundColor Green