#!/bin/bash
# Build script for Tab Workspace Manager extension

set -e

echo "🔨 Building Tab Workspace Manager Extension..."
echo ""

# Extension directory - detect script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$SCRIPT_DIR"
BUILD_DIR="$EXT_DIR/build"

# Get extension version from manifest.json or argument
VERSION_ARG="${1:-}"
if [ -n "$VERSION_ARG" ]; then
  VERSION="$VERSION_ARG"
else
  VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[0-9.]*"' "$EXT_DIR/manifest.json" | sed 's/.*"\([0-9.]*\)".*/\1/')
fi

TAG="${2:-v${VERSION}}"
ZIP_NAME="tab-workspace-manager-${TAG}.zip"
CRX_NAME="tab-workspace-manager-crx-${TAG}.crx"

echo "📌 Version: $VERSION"
echo "🏷️  Tag: $TAG"
echo ""

# Clean previous build
if [ -d "$BUILD_DIR" ]; then
  echo "🧹 Cleaning previous build..."
  rm -rf "$BUILD_DIR"
fi

mkdir -p "$BUILD_DIR"

# Copy extension files
echo "📦 Copying extension files..."

cp "$EXT_DIR/manifest.json" "$BUILD_DIR/"

# Copy directories
cp -r "$EXT_DIR/background" "$BUILD_DIR/"
cp -r "$EXT_DIR/sidepanel" "$BUILD_DIR/"
cp -r "$EXT_DIR/popup" "$BUILD_DIR/"
cp -r "$EXT_DIR/lib" "$BUILD_DIR/"
cp -r "$EXT_DIR/assets" "$BUILD_DIR/"

# Verify icons exist
if [ ! -f "$BUILD_DIR/assets/icons/icon-128.png" ]; then
  echo "❌ Error: Icons not found. Run generate_icons.py first."
  exit 1
fi

echo "✅ Extension files copied to build/"
echo ""

# Create ZIP for Chrome Web Store
echo "📦 Creating distribution package..."
cd "$BUILD_DIR"
zip -r "../$ZIP_NAME" . -x "*.DS_Store" "*.git*"
cd "$EXT_DIR"

echo "✅ Created $ZIP_NAME"
echo ""

# Generate CRX if Node.js is available and requested
if command -v node &> /dev/null && [ "$GENERATE_CRX" = "true" ]; then
  echo "📦 Generating CRX package..."
  node generate-crx.js "${TAG}"
fi

# Generate checksum
echo "🔐 Generating SHA256 checksum..."
sha256sum "$ZIP_NAME" > "$ZIP_NAME.sha256"

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Build complete!"
echo ""
echo "📌 Version:   $VERSION"
echo "🏷️  Tag:       $TAG"
echo "📁 Build dir: $BUILD_DIR"
echo "📦 Package:   $EXT_DIR/$ZIP_NAME"
echo "🔐 Checksum:  $EXT_DIR/$ZIP_NAME.sha256"
echo ""
echo "🚀 Next steps:"
echo "   1. Open Chrome and go to chrome://extensions/"
echo "   2. Enable 'Developer mode' (top right)"
echo "   3. Click 'Load unpacked' and select: $BUILD_DIR"
echo "   4. The extension will be installed and ready to use!"
echo ""
echo "📤 To publish to Chrome Web Store:"
echo "   Upload: $EXT_DIR/$ZIP_NAME"
echo ""
echo "💡 For CRX generation (signed package):"
echo "   Run: GENERATE_CRX=true ./build.sh [VERSION]"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
