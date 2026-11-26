# Public demo link access control

The public demo at `https://ravsoft-portal.pages.dev/dashboard` now uses a server-backed seven-day access window.

## How it works

- The first visitor who opens the demo starts a global seven-day window.
- The start timestamp is stored in the master Supabase project, not the browser.
- Clearing browser storage, reinstalling the PWA, or running setup again cannot restart the window.
- The **Clear operational data** and **Restore demo workshop** buttons are hidden in demo mode.
- After seven days, every visitor sees **Demo access ended**.
- Real client builds are unaffected because they have their own client Supabase project.

The RPC is:

```text
POST https://<MASTER_SUPABASE_URL>/rest/v1/rpc/poll_demo_access
```

It returns:

```json
{
  "started_at": "...",
  "expires_at": "...",
  "server_time": "...",
  "allowed": true
}
```

## Apply the migration once

Run this file against the **master portal Supabase project**:

```text
supabase/migrations/20261126000300_public_demo_access.sql
```

It creates:

- `public.demo_access_windows`
- `public.poll_demo_access()`

No direct table access is granted. The security-definer RPC is the only access path.

## Deploy the portal demo build

```powershell
npm run deploy:portal
```

The gate automatically activates in the portal build because it has the master portal keys but no client database keys.

## Optional fixed build expiry

A public demo can also have a hard build expiry:

```dotenv
VITE_DEMO_EXPIRES_AT=2026-12-31T23:59:59Z
```

Then:

```powershell
npm run build:demo
```

The effective expiry is the earlier of:

- the server-backed seven-day window, and
- the fixed build expiry, if set.

## Security note

The server-backed timestamp cannot be reset by clearing browser data. It is still a sales demo, not a confidential system. For confidential demonstrations, also protect the demo domain with Cloudflare Access or another login gate.
