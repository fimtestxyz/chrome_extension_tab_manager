#!/bin/bash
# Build script for Tab Workspace Manager extension

set -e

echo "🔨 Building Tab Workspace Manager Extension..."
echo ""

# Extension directory
EXT_DIR="/Volumes/wwk_nvme/Users/wwkoon/.openclaw/workspace/chrome_extension_tab_manager"
BUILD_DIR="$EXT_DIR/build"
ZIP_NAME="tab-workspace-manager.zip"

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
cd ..

echo "✅ Created $ZIP_NAME"
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Build complete!"
echo ""
echo "📁 Build output: $BUILD_DIR"
echo "📦 Distribution: $EXT_DIR/$ZIP_NAME"
echo ""
echo "🚀 Next steps:"
echo "   1. Open Chrome and go to chrome://extensions/"
echo "   2. Enable 'Developer mode' (top right)"
echo "   3. Click 'Load unpacked' and select: $BUILD_DIR"
echo "   4. The extension will be installed and ready to use!"
echo ""
echo "📤 To publish to Chrome Web Store:"
echo "   Upload: $EXT_DIR/$ZIP_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
