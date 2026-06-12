#!/usr/bin/env node
/**
 * CRX Package Generator
 * Generates CRX files for Chrome Extensions without requiring private keys.
 * This creates a standard ZIP-based CRX package compatible with direct installation.
 */

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { execSync } = require('child_process');

const BUILD_DIR = 'build';
const OUTPUT_NAME = 'tab-workspace-manager';

// Get version from arguments or default to timestamp
const version = process.argv[2] || `dev-${Date.now()}`;

console.log(`🔨 Building CRX package for version: ${version}\n`);

// Ensure build directory exists
if (!fs.existsSync(BUILD_DIR)) {
  console.error(`❌ Build directory '${BUILD_DIR}' does not exist. Run ./build.sh first.`);
  process.exit(1);
}

// Create source ZIP if it doesn't exist
const zipName = `${OUTPUT_NAME}.zip`;
if (!fs.existsSync(zipName)) {
  console.log('📦 Creating source ZIP...');
  try {
    execSync(`cd ${BUILD_DIR} && zip -r ../${zipName} . -x "*.DS_Store" "*.git*"`, { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Failed to create ZIP:', error.message);
    process.exit(1);
  }
}

// Generate CRX-compatible package
const crxName = `${OUTPUT_NAME}-crx-${version}.crx`;

console.log('📦 Generating CRX package...');

try {
  // For modern Chrome extensions, CRX is essentially a ZIP with specific headers
  // We'll create a simple ZIP-based CRX for direct installation
  const zipData = fs.readFileSync(zipName);

  // Create CRX header (simplified version - works for direct drag-drop)
  // Magic number: "Cr24"
  const magic = Buffer.from('Cr24');

  // Version (currently 3)
  const versionBuffer = Buffer.alloc(4);
  versionBuffer.writeUInt32LE(3, 0);

  // For unsigned CRX, key length and signature length are both 0
  const keyLengthBuffer = Buffer.alloc(4);
  const sigLengthBuffer = Buffer.alloc(4);

  // Concatenate all parts
  const crxData = Buffer.concat([
    magic,
    versionBuffer,
    keyLengthBuffer,
    sigLengthBuffer,
    zipData
  ]);

  // Write CRX file
  fs.writeFileSync(crxName, crxData);

  const crxSize = (crxData.length / 1024).toFixed(2);

  console.log('\n✅ CRX package created successfully!');
  console.log(`\n📦 Output: ${crxName} (${crxSize} KB)\n`);
  console.log('💡 Installation:');
  console.log('   Chrome: Drag the .crx file to chrome://extensions/ (with Dev Mode enabled)');
  console.log('   Edge: Drag the .crx file to edge://extensions/ (with Dev Mode enabled)');
  console.log('   Brave: Drag the .crx file to brave://extensions/ (with Dev Mode enabled)\n');

  // Generate checksum
  const checksum = createHash('sha256').update(crxData).digest('hex');
  console.log(`🔐 SHA256: ${checksum}\n`);

} catch (error) {
  console.error('❌ Failed to generate CRX:', error.message);
  process.exit(1);
}