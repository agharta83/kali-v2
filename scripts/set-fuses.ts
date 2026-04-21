/**
 * Electron Fuses Configuration Script
 *
 * This script hardens the Electron binary at build time by:
 * - Disabling runAsNode (prevents Node.js execution via command-line flag)
 * - Disabling Node.js CLI inspect arguments (prevents debug port exposure)
 * - Enabling ASAR integrity validation (prevents tampering with packaged app)
 *
 * Run this after electron-builder packaging in STORY-011.
 *
 * @see https://www.electronjs.org/docs/latest/tutorial/fuses
 */

import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

async function setFuses() {
  try {
    // Get the path to the electron package
    const electronPath = require.resolve('electron');

    console.log('Setting Electron Fuses for binary hardening...');

    await flipFuses(
      electronPath,
      {
        version: FuseVersion.V1,
        // Disable runAsNode to prevent Node.js execution via --node-* CLI flags
        [FuseV1Options.RunAsNode]: false,
        // Disable Node.js CLI inspect arguments to prevent debug port exposure
        [FuseV1Options.EnableNodeCliInspectArguments]: false,
        // Enable ASAR integrity validation to prevent tampering with packaged app
        [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      }
    );

    console.log('✓ Electron Fuses configured successfully');
    console.log('  - RunAsNode: disabled');
    console.log('  - NodeCliInspectArguments: disabled');
    console.log('  - EmbeddedAsarIntegrityValidation: enabled');
  } catch (error) {
    console.error('Error setting Electron Fuses:', error);
    process.exit(1);
  }
}

// Run if executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  setFuses().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export default setFuses;
