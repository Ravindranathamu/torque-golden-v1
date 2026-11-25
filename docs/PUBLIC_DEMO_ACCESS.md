# Public demo link access control

A localStorage-only demo can always be restarted by clearing browser data. To stop that, a public demo build has a fixed expiry compiled into the frontend.

## Build an expiring demo

1. Create `.env.demo` locally:

```dotenv
VITE_DEMO_EXPIRES_AT=2026-12-31T23:59:59Z
```

Use a UTC date/time. Choose the last day the demo should work.

2. Build the demo bundle:

```powershell
npm run build:demo
```

3. Deploy the generated `dist` folder to the demo Pages project.

After the expiry time, every route in that demo build shows **Demo access ended**. Clearing storage, reinstalling the PWA, or creating a new workshop cannot restart it.

## Renewing the demo

Set a newer `VITE_DEMO_EXPIRES_AT`, rebuild with `npm run build:demo`, and redeploy. Do not reuse an expired bundle.

## Important security note

The expiry is compiled into browser JavaScript. It stops normal users and storage-clearing, but it is **not a secret** and is not suitable for confidential data.

For a stronger public deployment, also protect the demo domain with one of:

- Cloudflare Access with email/password or one-time PIN
- Cloudflare Zero Trust with an allow-list
- Supabase Auth plus server-side workshop data

For RAVBsoft sales demos, the expiring build is usually enough because the data is only showcase data.

## Normal client builds

Leave `VITE_DEMO_EXPIRES_AT` blank for real client builds. Client installations continue to use Supabase and the developer portal registry for licence control.
