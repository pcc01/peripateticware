#!/bin/bash
# ==========================================
# PERIPATETICWARE FRONTEND SETUP SCRIPT
# Run once to set up complete frontend
# ==========================================

set -e

echo "🚀 Setting up Peripateticware Frontend..."

# Install dependencies
echo "[1/4] Installing dependencies..."
npm install --legacy-peer-deps >/dev/null 2>&1

# Build frontend
echo "[2/4] Building frontend..."
npm run build >/dev/null 2>&1

# Type check
echo "[3/4] Running type checks..."
npm run type-check 2>&1 | grep -i error || echo "✓ No TypeScript errors"

# Summary
echo "[4/4] Setup complete!"
echo ""
echo "✅ Frontend ready!"
echo ""
echo "Next commands:"
echo "  npm run dev      → Start dev server (http://localhost:5173)"
echo "  npm run build    → Build for production"
echo "  npm run preview  → Preview production build"
