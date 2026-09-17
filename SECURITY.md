# Security Policy

Ectotrees is a small, publicly hosted web app. If you find a vulnerability, thank you for taking the time to report it responsibly.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Report privately through GitHub's private vulnerability reporting:

https://github.com/Ectropy/ectotrees/security/advisories/new

Include what you found, how to reproduce it, and what impact you believe it has. A proof of concept against a session you created yourself is welcome; please do not test against other people's sessions or attempt to disrupt the live service.

You can expect an acknowledgement within 7 days. This is a volunteer-maintained project, so fixes are made on a best-effort basis, but confirmed issues that expose session credentials or let one user affect another's data are treated as top priority.

## Supported versions

Only the latest tagged release (what runs at the public deployment) receives security fixes. Self-hosters should track the newest `v*` tag of the container image.

## Scope

In scope:

- The server (`server/`) — session isolation, authorization (owner/moderator/scout/viewer roles), identity-token handling, input validation, rate limiting, persistence.
- The dashboard (`src/`) and Alt1 scout plugin (`alt1-plugin/`) — anything that could run injected script, leak an identity token, or make a client act against another session.
- The container image, compose example, and CI workflows in this repository.

Out of scope:

- Denial of service that requires many IP addresses or volumes far beyond a single user.
- Issues in third-party services the app loads (Google Tag Manager, the community RS3 map tiles).
- Reports from automated scanners with no demonstrated impact.

## What we already do

- Identity tokens and session codes are generated with a CSPRNG and validated by strict format on every path.
- The dashboard is served with a nonce-based Content Security Policy (no `unsafe-inline` scripts), HSTS, and a WebSocket origin allowlist.
- All client input is validated server-side against allowlists; names are stripped of control and invisible characters.
- Per-IP and per-connection rate limits on HTTP and WebSocket traffic.
- The container runs as an unprivileged user; dependencies are audited in CI and updated weekly with a cooldown period.
