# Manual E2E Verification Guide - STORY-003

## Overview
This guide provides step-by-step instructions for manually verifying the typed IPC communication layer between the main process and renderer process.

## Prerequisites
- All previous phases (1-3) completed
- TypeScript compilation passes: `pnpm run typecheck` ✅
- Build succeeds: `pnpm run build` ✅

## Verification Steps

### Step 1: Start the Development Server

```bash
pnpm run dev
```

**Expected Outcome:**
- Electron application window opens
- No console errors in terminal
- Main process initializes IPC router successfully

### Step 2: Open Developer Tools

1. In the Electron application window, open DevTools:
   - **macOS:** `Cmd + Option + I`
   - **Windows/Linux:** `Ctrl + Shift + I`
2. Navigate to the **Console** tab

### Step 3: Verify `window.kali` API Exists

In the DevTools Console, type:
```javascript
window.kali
```

**Expected Outcome:**
```javascript
{
  rpc: {
    settings: {
      get: [Function],
      update: [Function]
    }
  },
  events: {
    on: [Function],
    send: [Function]
  }
}
```

### Step 4: Test `settings.get()` RPC Call

In the DevTools Console, type:
```javascript
window.kali.rpc.settings.get("theme")
```

**Expected Outcome:**
- Returns a Promise
- Promise resolves with mock value: `"dark"`
- No errors in console

**Alternative Test Cases:**
```javascript
// Test other mock settings
window.kali.rpc.settings.get("language")  // → "en"
window.kali.rpc.settings.get("autoSave")  // → true
window.kali.rpc.settings.get("fontSize")  // → 14

// Test non-existent key
window.kali.rpc.settings.get("nonExistent")  // → null
```

### Step 5: Test `settings.update()` RPC Call

In the DevTools Console, type:
```javascript
window.kali.rpc.settings.update("theme", "light")
```

**Expected Outcome:**
- Returns a Promise
- Promise resolves with `undefined` (void return)
- Main process terminal logs: `"[Settings] update: theme → light"`
- No errors in console

**Follow-up Verification:**
```javascript
// Verify the update persisted in memory
window.kali.rpc.settings.get("theme")  // → "light"
```

### Step 6: Test Zod Validation (Error Case)

In the DevTools Console, type:
```javascript
window.kali.rpc.settings.get("")
```

**Expected Outcome:**
- Promise **rejects** with validation error
- Error contains:
  - `code: "VALIDATION_ERROR"`
  - `message` describing the validation failure
  - Error details from Zod

**Console Output Example:**
```javascript
Error: Validation failed: String must contain at least 1 character(s)
  code: "VALIDATION_ERROR"
  metadata: { issues: [...] }
```

### Step 7: Verify TypeScript Autocomplete (IDE Test)

1. Open `src/renderer/main.tsx` in your IDE (VS Code recommended)
2. In the React component, start typing:
   ```typescript
   window.kali.
   ```

**Expected Outcome:**
- Autocomplete suggestions appear showing:
  - `rpc`
  - `events`

3. Continue typing:
   ```typescript
   window.kali.rpc.
   ```

**Expected Outcome:**
- Autocomplete shows:
  - `settings`

4. Continue typing:
   ```typescript
   window.kali.rpc.settings.
   ```

**Expected Outcome:**
- Autocomplete shows:
  - `get(key: string): Promise<unknown>`
  - `update(key: string, value: unknown): Promise<void>`

### Step 8: Verify Event Streaming Infrastructure (Not Used Yet)

In the DevTools Console, type:
```javascript
window.kali.events.on("test-event", (data) => {
  console.log("Received:", data);
});
```

**Expected Outcome:**
- No errors
- Event listener registered successfully
- **Note:** This is infrastructure only; no events are sent yet (future epics)

## Verification Checklist

- [ ] Electron app launches without errors (`pnpm run dev`)
- [ ] DevTools console opens successfully
- [ ] `window.kali` object exists
- [ ] `window.kali.rpc.settings.get("theme")` returns `"dark"`
- [ ] `window.kali.rpc.settings.update("theme", "light")` succeeds
- [ ] `window.kali.rpc.settings.get("")` throws validation error with `code: "VALIDATION_ERROR"`
- [ ] TypeScript autocomplete works for `window.kali.rpc.settings.get/update` in IDE
- [ ] `window.kali.events.on()` and `events.send()` are accessible
- [ ] No console errors during any test
- [ ] Main process terminal shows appropriate logs for RPC calls

## Success Criteria

✅ **All checklist items pass** → Phase 4 (Integration & Manual Testing) is COMPLETE

## Troubleshooting

### Issue: `window.kali` is undefined
- **Cause:** Preload script not loaded or contextBridge failed
- **Fix:** Verify `src/preload/index.ts` imports `'./bridge'`
- **Fix:** Check main process console for preload errors

### Issue: RPC call hangs or times out
- **Cause:** IPC router not registered in main process
- **Fix:** Verify `src/main/index.ts` calls `createRPCRouter()` before `createWindow()`
- **Fix:** Check main process terminal for IPC registration logs

### Issue: TypeScript autocomplete not working
- **Cause:** TypeScript not recognizing `window.kali` types
- **Fix:** Add type declaration to `src/renderer/env.d.ts`:
  ```typescript
  import type { KaliAPI } from '@shared/types/ipc';
  
  declare global {
    interface Window {
      kali: KaliAPI;
    }
  }
  ```

### Issue: Validation error format unexpected
- **Cause:** Error serialization across IPC boundary
- **Fix:** Verify `src/main/ipc/router.ts` catches `ZodError` and converts to `BusinessError`

## Notes

- **Mock Data Only:** Settings handlers return hardcoded values. Database integration is STORY-005.
- **Event Streaming:** Infrastructure is wired but not used yet. Will be activated in future epics.
- **Security:** All IPC calls use `contextBridge` - raw `ipcRenderer` is never exposed to renderer.
- **Validation:** All inputs validated with Zod before reaching handlers.

## Next Steps After Verification

Once all verification steps pass:
1. ✅ Mark subtask-4-1 as completed in `implementation_plan.json`
2. ✅ Update `build-progress.txt` with verification results
3. ✅ Proceed to Phase 5: Unit Tests (subtasks 5-1 and 5-2)
