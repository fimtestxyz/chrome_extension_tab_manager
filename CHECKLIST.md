# ✅ GitHub Actions Setup Checklist

## Quick Setup Guide

✅ **Created Files:**

| File | Purpose |
|------|---------|
| `.github/workflows/build-extension.yml` | Main CI/CD workflow |
| `.github/workflows/README.md` | Workflow documentation |
| `package.json` | npm build commands |
| `generate-crx.js` | CRX generator script |
| `DEPLOYMENT.md` | Full deployment guide |

## 🚀 First Run

```bash
# 1. Commit the new files
git add .github/ package.json generate-crx.js DEPLOYMENT.md
git commit -m "ci: add GitHub Actions workflow for extension packaging"

# 2. Push to GitHub
git push origin main

# 3. Create your first release
git tag v1.0.0
git push origin v1.0.0
```

## 🔧 Workflow Triggers

| Trigger | When | Output |
|---------|------|--------|
| Tagged push (`v*`) | Push version tag | GitHub Release + artifacts |
| Manual dispatch | Via Actions UI | Build artifacts only |

## 📦 Workflow Outputs

For version `v1.0.0`:
- `tab-workspace-manager-v1.0.0.zip` ← **Chrome Web Store**
- `tab-workspace-manager-crx-v1.0.0.crx` ← Direct install
- `tab-workspace-manager-v1.0.0.zip.sha256` ← Checksum
- `update-manifest.xml` ← Auto-update

## 🧪 Test Locally First

```bash
# Test the build script
./build.sh

# Test CRX generation
npm run crx v1.0.0
```

## 📝 Next Steps

1. **Update `manifest.json`** - Set correct URLs and IDs:
   ```json
   "homepage_url": "https://github.com/yourusername/tab-workspace-manager"
   ```

2. **Configure Auto-Update** - After getting your extension ID:
   - Install the extension
   - Get ID from `chrome://extensions/`
   - Update the workflow's `update-manifest.xml` template

3. **Prepare for Chrome Web Store**:
   - Create screenshots (1280x800 or 640x400)
   - Write store description
   - Get developer account ($5 fee)
   - Submit for review

## 🎯 Quick Commands

```bash
npm run build          # Build extension
npm run build:crx      # Build with CRX
npm run clean          # Clean build artifacts
```

## ⚠️ Notes

- CRX is for **direct distribution only** - Chrome Web Store requires ZIP
- For signed CRX, add `CRX_PRIVATE_KEY` to GitHub Secrets
- Artifact retention: 90 days (configurable)

---

**Status**: ✅ Ready to use! Trigger a release by pushing a version tag.