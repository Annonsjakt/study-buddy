# study-buddy-server

Small backend for StudyBuddy: holds the Claude API key and proxies
`/api/messages` to Anthropic (the key never reaches the browser); optional
accounts and sync (email/password auth, one JSON blob per user in SQLite,
mirroring what `js/store.js` already keeps in `localStorage`); and optional
parent/teacher linking (invite-code based) with read-only progress access and
set assignment for linked students.

## Run it

```bash
cd server
npm install
cp .env.example .env   # then fill in ANTHROPIC_API_KEY
npm start
```

Runs on `http://localhost:8787` by default, with a `studybuddy.sqlite3` file
created alongside it on first run. Point the frontend at it via `js/config.js`.

## Routes

- `GET /api/health` — `{ok, keyConfigured}`
- `POST /api/messages` — proxies to Anthropic (streaming passthrough for the tutor)
- `POST /api/auth/signup`, `/login`, `/logout`, `GET /api/auth/me` — email/password,
  httpOnly session cookie
- `GET/PUT /api/state` — the signed-in user's synced state blob (requires auth);
  `PUT` takes `{version, blob}` and returns `409` with the current version/blob on
  a stale write
- `POST /api/links/invite-code` — the signed-in user generates a 6-character code,
  valid 30 minutes, usable once
- `POST /api/links/redeem {code}` — the signed-in user redeems someone else's code,
  creating an active link where they're the parent/teacher and the code's owner is
  the student
- `GET /api/links` — the signed-in user's links in both directions:
  `{asParent: [...], asStudent: [...]}`
- `DELETE /api/links/:linkId` — either side of a link can remove it
- `POST /api/assigned {studentUserId, doc, dueAt?}` — assign a set (same doc shape
  `generateAssignment()`/`addAssignmentDoc()` use) to a linked student; requires an
  active link to that student
- `GET /api/assigned-for-me` — the signed-in user's pending assigned sets
- `DELETE /api/assigned/:id` — the student clears one from their queue (after importing it)
- `GET /api/parent/students/:studentUserId/state` — read-only: a linked student's
  synced blob, for the parent/teacher dashboard; requires an active link

## Dev-only today

`ALLOWED_ORIGIN` restricts CORS (defaults to `http://localhost:8000`) and every route
except `/api/health` and `/api/messages` requires a valid session (plus an active link,
for the parent/teacher routes) — but `/api/messages` itself still has no per-request
auth of its own, so anyone who can reach this server can spend the configured API key
regardless of whether they've signed in. `COOKIE_SECURE` should be set to `true` once
this runs over https; it's left `false` for local http dev. Don't expose this beyond
your own machine/network without addressing both.
