# Alt1 Scout Plugin

A separate Vite app (served at `/alt1`) for scouts to submit spawn intel from inside RuneScape via Alt1 Toolkit.

## File Structure

```
alt1-plugin/src/
  App.tsx               # Root component: orchestrates session, world, scan, and form state
  scanner.ts            # Alt1 pixel scanning logic: reads spawn timer and location hint from dialog
  parser.ts             # Parses raw dialog text into { hours, minutes, hint }
  hooks/
    useScoutSession.ts  # WebSocket session management for the scout: create/join/leave, reconnection, mutations
    useAlt1.ts          # Alt1 API access: isAlt1, hasPixel, hasGameState, scanWorld(), scanDialog()
    useCountdown.ts     # Countdown timer hook (local copy of main app's useCountdown)
  components/
    SessionPanel.tsx    # Session connect/join/create UI + invite token input
    WorldInput.tsx      # World number field with manual scan button + auto-world toggle
    ReportForm.tsx      # Spawn timer (hr/min) + hint field + scan/auto-scan/auto-submit controls
    DebugPanel.tsx      # Dev-only debug overlay (rendered in development mode only)
    ui/tooltip.tsx      # Tooltip primitive (local copy)
```

## Features

- **Session management**: join by 6-char code or `#join=` URL fragment; code persisted to `localStorage` (`evilTree_sessionCode`) and auto-resumed on startup
- **Invite token join**: join a managed session by entering or pasting a 12-char invite token (or URL containing one); token is persisted to `localStorage` (`evilTree_inviteToken`) and used for `authInvite` on reconnect; world hops are reported in real time (`reportWorld`)
- **Auto-world** (toggleable, persisted as `scout_autoWorld`): polls `alt1.lastWorldHop` every 5s; on hop, auto-fills the world field and calls `reportWorld(worldId)` to sync the dashboard's scout indicator
- **Manual dialog scan**: scans Alt1 pixel buffer for the Spirit Tree dialog to extract spawn timer and hint
- **Auto-scan** (toggleable, persisted as `scout_autoScan`): watches `alt1.rsLastActive` for RS clicks; retries scan every 300ms in the 150–800ms window after a click to catch the dialog as soon as it renders
- **Auto-submit** (toggleable, persisted as `scout_autoSubmit`): starts a 10s countdown when world + timer + hint are all filled in; payload is snapshotted at countdown start so world hops during the countdown don't corrupt the submission; cancel by clicking the auto-submit button or clearing a field
- **ACK-driven UX**: submit button shows "Submitting..." until server `ack` is received; disconnect before ack shows an error; fields auto-clear on successful ack (only if unchanged since submit)
