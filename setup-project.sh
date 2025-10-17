#!/bin/bash

# RentFlow AI - Complete Project Setup Script
# Usage: ./setup-project.sh YOUR_GITHUB_USERNAME

set -e  # Exit on error

USERNAME=$1
if [ -z "$USERNAME" ]; then
  echo "Usage: ./setup-project.sh YOUR_GITHUB_USERNAME"
  exit 1
fi

echo "🚀 Setting up RentFlow AI project..."

# Create project directory
PROJECT_NAME="rentflow-ai"
mkdir -p $PROJECT_NAME
cd $PROJECT_NAME

# Initialize git
git init
git branch -M main

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p contracts/{test,scripts} \
         backend/{src,tests} \
         frontend/{src/{components,hooks,utils},public} \
         database \
         docs \
         scripts

# Create .gitignore
echo "📝 Creating .gitignore..."
cat > .gitignore << 'GITIGNORE'
node_modules/
.env
.env.local
dist/
build/
cache/
artifacts/
coverage/
.DS_Store
*.log
GITIGNORE

# Create package.json
echo "📦 Creating package.json..."
cat > package.json << 'PACKAGE'
{
  "name": "rentflow-ai",
  "version": "1.0.0",
  "description": "AI-Powered Property Management on Arc with USDC",
  "scripts": {
    "install:all": "npm install && cd backend && npm install && cd ../frontend && npm install",
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "cd backend && npm run dev",
    "dev:frontend": "cd frontend && npm start"
  },
  "license": "MIT",
  "keywords": ["blockchain", "ai", "property-management", "arc", "usdc"]
}
PACKAGE

# Create README
echo "📖 Creating README..."
cat > README.md << 'README'
# 🏠 RentFlow AI

> AI-Powered Property Management on Arc with USDC

Built for the AI Agents on Arc with USDC Hackathon

## Quick Start
```bash
git clone https://github.com/$USERNAME/rentflow-ai.git
cd rentflow-ai
npm run install:all
npm run dev
```
README

# Create LICENSE
echo "⚖️  Creating LICENSE..."
cat > LICENSE << 'LICENSE'
MIT License

Copyright (c) 2025 RentFlow AI Team

Permission is hereby granted, free of charge...
LICENSE

# Create placeholder files
touch contracts/RentFlowCore.sol
touch backend/src/index.ts
touch frontend/src/App.tsx
touch database/schema.sql
touch docs/DEPLOYMENT.md

# Initialize npm
npm init -y

# Create GitHub repo and push
echo "🌐 Creating GitHub repository..."
gh repo create $PROJECT_NAME \
  --public \
  --description "AI-Powered Property Management on Arc with USDC" \
  --source=. \
  --remote=origin

# Initial commit
git add .
git commit -m "feat: initial project setup"
git push -u origin main

echo "✅ Project setup complete!"
echo "📍 Repository: https://github.com/$USERNAME/$PROJECT_NAME"
echo "🔗 Clone URL: git@github.com:$USERNAME/$PROJECT_NAME.git"
