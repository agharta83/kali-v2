// SPDX-License-Identifier: AGPL-3.0-or-later
// Electron preload entry point — exposes typed RPC API to the renderer.
// This script runs in a sandboxed context with access to both Electron APIs
// and the renderer DOM, allowing secure communication via contextBridge.

// Import and initialize the IPC bridge
import './bridge';
