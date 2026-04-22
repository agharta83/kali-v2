// SPDX-License-Identifier: AGPL-3.0-or-later
// Electron main process entry point.

import { app, BrowserWindow, session } from 'electron';
import { join } from 'path';
import { createRPCRouter } from './ipc/router';

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
app.whenReady().then(() => {
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
