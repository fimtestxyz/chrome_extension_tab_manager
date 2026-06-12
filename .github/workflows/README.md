# Chrome Extension CI/CD

This directory contains workflows for building and packaging the Chrome extension.

## Workflows

### `build-extension.yml`

Builds the extension and distributes it via GitHub Releases.

## Triggering Builds

### Tagged Release (Recommended)
```bash
git tag v1.0.0
git push origin v1.0.0
```

This will:
1. Build the extension
2. Create ZIP file for Chrome Web Store
3. Generate CRX for direct distribution
4. Create GitHub Release with artifacts

### Manual Build
Using the GitHub Actions UI, trigger the workflow manually with a custom tag (optional).

## Artifacts

Each build produces:
- `tab-workspace-manager-VERSION.zip` - For Chrome Web Store
- `tab-workspace-manager-VERSION.crx` - For direct installation
- `update-manifest.xml` - Auto-update manifest
- `.zip.sha256` - Integrity checksum

## Setting Up CRX Signing (Optional)

For signed CRX generation, add your private key as a secret:

1. Generate a private key (only needed once):
```bash
openssl genrsa -out private-key.pem 2048
```

2. Add the private key to GitHub Secrets:
   - Repository Settings → Secrets and variables → Actions → New repository secret
   - Name: `CRX_PRIVATE_KEY`
   - Value: Contents of `private-key.pem`

3. Update the workflow to use your actual extension ID

**Note:** For Chrome Web Store distribution, signed CRX is not required. The ZIP file is sufficient.

## Chrome Web Store Publishing

After a tagged release builds successfully:

1. Download `tab-workspace-manager-VERSION.zip` from the Release
2. Upload to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Complete the store listing and submit for review

## Development Testing

To test locally before release:
```bash
./build.sh
cd build
# Then load as unpacked extension in chrome://extensions/
```