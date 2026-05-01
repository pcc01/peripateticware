# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

#!/bin/bash

# Peripateticware Frontend - Quick Setup Script
# This script automates the initial setup for new developers

set -e  # Exit on error

echo "🚀 Peripateticware Frontend - Setup Script"
echo "==========================================="
echo ""

# Check Node.js version
echo "✓ Checking Node.js version..."
NODE_VERSION=$(node -v)
echo "  Found: $NODE_VERSION"

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Create environment file
echo ""
echo "⚙️  Creating environment file..."
if [ ! -f .env.local ]; then
    cp .env.example .env.local
    echo "  ✓ Created .env.local"
else
    echo "  ℹ️  .env.local already exists"
fi

# Run tests
echo ""
echo "🧪 Running tests..."
npm run test -- --run --reporter=verbose

# Check types
echo ""
echo "📋 Type checking..."
npm run type-check

# Lint code
echo ""
echo "🔍 Linting code..."
npm run lint

# Build
echo ""
echo "🏗️  Building project..."
npm run build

# Summary
echo ""
echo "✅ Setup Complete!"
echo ""
echo "📚 Next steps:"
echo ""
echo "1. Start development server:"
echo "   npm run dev"
echo ""
echo "2. In another terminal, start the backend:"
echo "   # In your Peripateticware backend directory"
echo "   python -m uvicorn main:app --reload --port 8010"
echo ""
echo "3. Open browser:"
echo "   http://localhost:5173"
echo ""
echo "📖 Documentation:"
echo "  - README.md         - Project overview"
echo "  - API.md            - API integration"
echo "  - DEPLOYMENT.md     - Deployment guide"
echo "  - CONTRIBUTING.md   - Developer guidelines"
echo ""
echo "💡 Useful commands:"
echo "  npm run dev         - Start dev server"
echo "  npm run test        - Run tests"
echo "  npm run storybook   - View components"
echo "  npm run build       - Build for production"
echo ""
echo "Happy coding! 🎉"
