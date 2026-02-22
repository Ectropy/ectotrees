Review the current CLAUDE.md against the actual codebase and update it if anything is out of date.

Check for:

    New or removed dependencies in package.json
    New or removed REST endpoints or WebSocket message types in server/index.ts and server/session.ts
    New or removed components in src/components/
    New or removed hooks in src/hooks/
    Changes to shared types, constants, or mutation functions in shared/
    Changes to project structure (new directories, moved files)
    Changes to environment variables documented for server/index.ts or server/log.ts
    Changes to build/dev/test commands in package.json
    New conventions or patterns that have emerged

Only update sections that are actually stale. Do not rewrite sections that are still accurate.