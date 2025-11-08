#!/bin/bash
# Render Deployment Script
# This script helps deploy to Render.com

set -e

echo "🚀 Render Deployment Helper"
echo "============================"
echo ""

# Check if git repo is clean
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  You have uncommitted changes."
    echo "   It's recommended to commit and push to GitHub first."
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if remote exists
if ! git remote get-url origin &>/dev/null; then
    echo "❌ No GitHub remote found!"
    echo ""
    echo "Please set up GitHub first:"
    echo "  1. Create a repository on GitHub"
    echo "  2. Run: git remote add origin https://github.com/yourusername/yourrepo.git"
    echo "  3. Run: git push -u origin main"
    exit 1
fi

echo "✅ GitHub remote found"
echo ""

# Check if we should push
read -p "Push to GitHub first? (recommended) (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📤 Pushing to GitHub..."
    git push origin $(git branch --show-current)
    echo "✅ Pushed to GitHub"
    echo ""
fi

echo "📋 Next Steps for Render.com:"
echo "=============================="
echo ""
echo "1. Go to https://render.com and sign in"
echo "2. Click 'New +' → 'Web Service'"
echo "3. Connect your GitHub repository"
echo "4. Render will auto-detect render.yaml"
echo "5. Add environment variables from your .env file:"
echo ""
echo "   Required:"
echo "   - NEON_DATABASE_URL"
echo ""
echo "   Optional (if you use them):"
echo "   - REDIS_URL or REDIS_HOST, REDIS_PORT, REDIS_PASSWORD"
echo "   - MQTT_ENABLED, MQTT_BROKER_HOST, MQTT_BROKER_PORT, etc."
echo ""
echo "6. Click 'Create Web Service'"
echo ""
echo "Your app will be available at: https://your-service-name.onrender.com"
echo ""
echo "💡 Tip: Use Render's web UI - it's easier than CLI for first-time setup"
echo ""

