# Chrome Extension Deployment Guide

## Quick Start

### 1. Build for Development
```bash
npm run build
# or
./build.sh
```

### 2. Build for Production
```bash
git tag v1.0.0
git push origin v1.0.0
```
This triggers the GitHub Actions workflow to create a release.

### 3. Load in Chrome (Developer Testing)
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `build/` directory

## Distribution Formats

| Format | Use Case | Chrome Web Store |
|--------|----------|------------------|
| `.zip` | Chrome Web Store upload | ✅ Preferred |
| `.crx` | Direct installation/distribution | ❌ Web Store doesn't accept |
| Unpacked | Development/testing | ❌ Not accepted |

## GitHub Actions Workflow

The `.github/workflows/build-extension.yml` builds on:

- **Tagged releases** (`v*`) - Creates formal releases with artifacts
- **Manual dispatch** - Test builds from the Actions tab

### Output Artifacts

For tag `v1.0.0`:
- `tab-workspace-manager-v1.0.0.zip` - For Chrome Web Store
- `tab-workspace-manager-crx-v1.0.0.crx` - Direct installation
- `tab-workspace-manager-v1.0.0.zip.sha256` - Integrity checksum
- `update-manifest.xml` - Auto-update manifest

### Workflow Steps

1. Setup Node.js and Python
2. Generate icons (if needed)
3. Build extension
4. Get version from `manifest.json`
5. Create versioned ZIP
6. Generate CRX package
7. Generate update manifest
8. Generate SHA256 checksum
9. Upload artifacts (90-day retention)
10. Create GitHub Release (for tagged builds)

## Chrome Web Store Publishing

### Prerequisites

1. Google account
2. [Chrome Web Store Developer Dashboard access](https://chrome.google.com/webstore/devconsole)
3. One-time fee: $5 USD

### Publication Steps

1. **Create New Item** in Developer Dashboard
2. **Upload Package**:
   - Download ZIP from GitHub Release
   - Or download from Workflow Artifacts
3. **Complete Listing**:
   - Screenshots (1280x800 or 640x400)
   - Store listing details
   - Category selection
   - Privacy policy URL
4. **Submit for Review** (typically 1-3 days)

### Review Tips

- Ensure all icons are present
- Test thoroughly before submitting
- Provide clear screenshots
- Write accurate descriptions
- Include privacy policy (even if basic)

## CI/CD Best Practices

### Semantic Versioning

Use [SemVer](https://semver.org/):
- **Major**: Breaking changes
- **Minor**: New features, backward compatible
- **Patch**: Bug fixes

Examples:
```bash
git tag v1.0.0    # First release
git tag v1.0.1    # Bug fix
git tag v1.1.0    # New feature
git tag v2.0.0    # Breaking changes
```

### Beta/Pre-release

Use pre-release tags:
```bash
git tag v1.1.0-beta.1
git tag v1.1.0-rc.1
```

Update GitHub Actions to mark as prerelease:
```yaml
prerelease: ${{ contains(github.ref, 'beta') || contains(github.ref, 'rc') }}
```

### Testing Before Tag

```bash
# Test build locally
npm run build

# Load and test extension

# Only then tag
git tag v1.0.0
git push origin v1.0.0
```

## Troubleshooting

### Build Fails

```bash
# Check for missing files
ls -la assets/icons/

# Regenerate icons if needed
python generate_icons.py

# Re-run build
npm run build
```

### CRX Won't Install

- Chrome extensions require ZIP format internally
- Unsigned CRX may need Developer Mode enabled
- Check Chrome version compatibility (minimum: 114)

### Workflow Timeout

- Increase timeout in GitHub Actions
- Optimize build steps
- Use caching if needed

## Extension ID

Find your extension ID after installation:
1. Go to `chrome://extensions/`
2. Note the ID (32-character string)
3. Update `update-manifest.xml` template in workflow

## Auto-Updates

To enable auto-updates, host:
1. The CRX file (or ZIP) at a public URL
2. An `update.xml` file pointing to it

Example `update.xml`:
```xml
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='YOUR_EXTENSION_ID'>
    <updatecheck codebase='https://example.com/extension.crx' version='1.0.0' />
  </app>
</gupdate>
```

## Resources

- [Chrome Extension Publishing](https://developer.chrome.com/docs/webstore/publish/)
- [Manifest V3 Guide](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome Web Store Policy](https://developer.chrome.com/docs/webstore/program-policies/)