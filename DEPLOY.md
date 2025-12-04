# Railway Deployment Guide

## Step 1: Push to GitHub

1. Go to https://github.com/new
2. Create a new repository (name it "safeguard-deal-sheet")
3. Don't initialize with README
4. Run these commands in your terminal:

```bash
cd /Users/brandonreed/Desktop/New_Safeguard_Stack
git remote add origin https://github.com/YOUR_USERNAME/safeguard-deal-sheet.git
git branch -M main
git push -u origin main
```

## Step 2: Deploy to Railway

1. Go to https://railway.app/
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your "safeguard-deal-sheet" repository
5. Railway will auto-detect it's a Node.js app and deploy it

## Step 3: Your app will be live!

Railway will give you a URL like: `https://safeguard-deal-sheet-production.up.railway.app`

The SQLite database will persist on Railway's disk storage.

## Environment Variables (if needed)
- Railway auto-sets `PORT`
- Your app is already configured to use it

That's it! Your app will be online and accessible to anyone.
