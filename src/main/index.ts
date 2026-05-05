// SPDX-License-Identifier: AGPL-3.0-or-later
// Electron main process entry point.

import { app, BrowserWindow, session } from 'electron';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { createRPCRouter } from './ipc/router';
import { SafeStorageSecretStore } from '../infrastructure/secrets/SafeStorageSecretStore';
import { initializeDatabase } from '../infrastructure/database/connection';
import { runMigrations } from '../infrastructure/database/migrate';

/**
 * Initialize encrypted database with key management and migrations.
 *
 * This function performs the complete database initialization sequence:
 * 1. Get or generate the database encryption key using SafeStorageSecretStore
 * 2. Initialize the encrypted SQLite database with SQLCipher
 * 3. Run all pending migrations transactionally
 *
 * The encryption key is:
 * - Generated once on first app launch using crypto.randomBytes(32)
 * - Stored securely via Electron's safeStorage API (OS keychain)
 * - Retrieved from secure storage on subsequent launches
 *
 * @throws Error if safeStorage encryption is unavailable (Linux without libsecret)
 * @throws Error if database initialization or migrations fail
 */
async function initializeDatabaseLayer(): Promise<void> {
  const secretStore = new SafeStorageSecretStore();
  const secretKey = 'kali:db:master';

  // Get or generate database encryption key
  let encryptionKey: string;
  const keyExists = await secretStore.hasSecret(secretKey);

  if (!keyExists) {
    // First-time initialization - generate new 256-bit encryption key
    // Using cryptographically secure random bytes (32 bytes = 256 bits)
    encryptionKey = randomBytes(32).toString('hex');

    // Store key securely using OS keychain (Keychain on macOS, DPAPI on Windows, libsecret on Linux)
    await secretStore.setSecret(secretKey, encryptionKey);

    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log('Generated new database encryption key');
    }
  } else {
    // Retrieve existing encryption key from secure storage
    const retrievedKey = await secretStore.getSecret(secretKey);
    if (!retrievedKey) {
      throw new Error('Failed to retrieve database encryption key from secure storage');
    }
    encryptionKey = retrievedKey;

    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log('Retrieved existing database encryption key');
    }
  }

  // Initialize encrypted database with SQLCipher
  // CRITICAL: cipher and key pragmas are set immediately after opening database
  const { sqlite } = initializeDatabase(encryptionKey);

  // Run all pending migrations transactionally
  // Drizzle handles transaction safety - failures roll back automatically
  await runMigrations(sqlite);
}

/**
 * Creates the main application window with security-first configuration.
 * Security settings:
 * - contextIsolation: true - Isolates preload scripts from renderer context
 * - sandbox: true - Enables Chromium sandbox for renderer process
 * - nodeIntegration: false - Prevents direct Node.js access in renderer
 */
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true
    }
  });

  // Defense-in-depth: block all navigation and new-window requests.
  // The renderer is a SPA; any navigation attempt indicates misuse or attack.
  // Allowed renderer origins are whitelisted explicitly.
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isAllowed = rendererUrl
      ? url.startsWith(rendererUrl)
      : url.startsWith('file://');
    if (!isAllowed) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // In development, electron-vite will set ELECTRON_RENDERER_URL
  // In production, load from built files
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// Create window when Electron is ready
app.whenReady().then(async () => {
  // Configure Content Security Policy headers
  // CSP restricts resource loading to prevent XSS and code injection attacks
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          // default-src: Only allow resources from same origin
          "default-src 'self'",
          // script-src: Allow scripts from same origin and inline scripts (needed for Vite HMR in dev)
          process.env.NODE_ENV === 'development'
            ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
            : "script-src 'self'",
          // style-src: Allow styles from same origin and inline styles (needed for React Bootstrap)
          "style-src 'self' 'unsafe-inline'",
          // img-src: Allow images from same origin and data URIs
          "img-src 'self' data:",
          // connect-src: Allow connections to same origin (and Vite HMR in dev)
          process.env.NODE_ENV === 'development'
            ? "connect-src 'self' ws://localhost:* http://localhost:*"
            : "connect-src 'self'",
          // font-src: Allow fonts from same origin and data URIs
          "font-src 'self' data:",
          // object-src: Disallow plugins
          "object-src 'none'",
          // base-uri: Restrict base tag to same origin
          "base-uri 'self'",
          // form-action: Restrict form submissions to same origin
          "form-action 'self'",
          // frame-ancestors: Prevent clickjacking
          "frame-ancestors 'none'"
        ].join('; ')
      }
    });
  });

  // Initialize encrypted database BEFORE any other operations
  // This must complete before window creation to ensure database is ready
  // Order: 1) Get/generate key → 2) Initialize DB → 3) Run migrations → 4) Ready
  try {
    await initializeDatabaseLayer();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize database:', error);
    // Exit application on database initialization failure
    // Database is critical infrastructure - app cannot function without it
    app.quit();
    return;
  }

  // Initialize IPC router for main ↔ renderer communication
  // Must be called before window creation to ensure handlers are ready
  createRPCRouter();

  createWindow();

  // On macOS, re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
