# Daily Google Drive backup

The workshop uploads a complete JSON snapshot of its application state to Google
Drive once a day. The browser never holds Google OAuth credentials: it posts the
snapshot to a small webhook that you control, and that webhook writes the file to
Drive.

Two receivers are supported:

- **Google Apps Script web app** — quickest to set up; recommended for a single
  workshop.
- **Supabase Edge Function** — recommended when you already run the client
  Supabase project and want central monitoring.

## What is uploaded

`src/lib/driveBackup.ts` builds a JSON document:

```json
{
  "app": "torque-erp",
  "version": 4,
  "exportedAt": "2026-11-15T02:05:00.000Z",
  "company": "AutoCare Motors",
  "state": { "...": "complete AppState" }
}
```

The filename is `<workshop-slug>-backup-YYYY-MM-DD.json`. The snapshot includes
settings, users, workers, jobs, tasks, parts, bills, insurance claims, inventory,
suppliers, ledger, payroll and embedded damage photos. Treat it as confidential:
it contains staff PINs and the local owner password in demo mode.

## 1. Create the Drive folder

1. Open Google Drive with the workshop account.
2. Create a folder such as `RAVsoft Backups`.
3. Copy the folder ID from the URL:
   `https://drive.google.com/drive/folders/<FOLDER_ID>`.

## 2. Option A — Google Apps Script webhook

1. Go to <https://script.google.com> and create a new project.
2. Paste this script, replacing `SHARED_SECRET` and `DEFAULT_FOLDER_ID`:

```javascript
const SHARED_SECRET = 'replace-with-a-long-random-secret';
const DEFAULT_FOLDER_ID = 'replace-with-your-drive-folder-id';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.key !== SHARED_SECRET) {
      return json({ ok: false, message: 'Unauthorised backup key.' });
    }
    if (!body.filename || !body.content) {
      return json({ ok: false, message: 'filename and content are required.' });
    }

    const folderId = body.folderId || DEFAULT_FOLDER_ID;
    const folder = DriveApp.getFolderById(folderId);
    const file = folder.createFile(
      body.filename,
      body.content,
      MimeType.PLAIN_TEXT,
    );
    return json({
      ok: true,
      message: 'Backup saved to Google Drive.',
      fileId: file.getId(),
    });
  } catch (error) {
    return json({ ok: false, message: String(error) });
  }
}

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
```

3. **Deploy → New deployment → Web app**.
   - Execute as: **Me**.
   - Who has access: **Anyone** (the shared secret is the gate).
4. Authorise the script and copy the `/exec` URL.
5. In the workshop: **Settings → Data & backup → Daily Google Drive backup**.
   - Paste the web app URL and the same secret.
   - Paste the folder ID (or leave blank to use the script default).
   - Choose the earliest backup hour, for example `2` for 02:00.
   - Select **Enabled**, then **Save backup settings**.
   - Click **Backup now** and confirm the status shows the uploaded file.

The browser sends `Content-Type: text/plain` so Apps Script does not require a
CORS preflight. The webhook must return JSON with `ok`, `message` and optionally
`fileId`.

### Apps Script limits

- A web app request is limited to roughly 50 MB. Snapshots with many embedded
  photos can approach that; archive or compress photos separately if needed.
- The script runs as the deploying account. Keep that account active and monitor
  its Drive quota.
- Rotating the secret requires updating both the script and every workshop
  installation.

## 3. Option B — Supabase Edge Function

Use this when each client already has a Supabase project.

1. Create a Google Cloud service account with the Drive API enabled.
2. Share the backup folder with the service-account email (Editor).
3. Store the service-account JSON, folder ID and backup secret as Supabase
   function secrets. Never ship them to the browser.
4. Deploy an Edge Function that:
   - verifies the `key` in the request body;
   - optionally validates the caller's workshop;
   - uploads `content` to Drive with the Drive REST API;
   - returns `{ "ok": true, "message": "...", "fileId": "..." }`.
5. Put the function URL and secret in **Settings → Data & backup**.

If the workshop uses Supabase cloud sync, add a scheduled function that reads
`app_records`, rebuilds the state document and uploads it even when no browser is
open. The browser catch-up upload remains a useful second layer.

## 4. Schedule behaviour

- The app checks after launch and whenever settings or state change.
- If the local date has no successful backup and the current hour is at or past
  the configured hour, it uploads once.
- If the app was closed at the scheduled hour, the upload runs at the next
  launch. Keep at least one workshop device switched on, or use the server-side
  scheduled function above for guaranteed unattended backups.
- The last success time, status message and filename are shown in Settings.
- Failures never block billing; the status line records the error.

## 5. Restore

1. Open Google Drive and download the required
   `<slug>-backup-YYYY-MM-DD.json`.
2. In the workshop, open **Settings → Data & backup → Import backup**.
3. Select the file and sign in again.
4. Verify jobs, bills and the ledger before taking new payments.

Both raw `AppState` exports and the Drive wrapper (`{ app, version, state }`) are
accepted.

## 6. Security checklist

- [ ] The webhook URL uses HTTPS.
- [ ] The shared secret is long, random and stored only in the script and the
      workshop settings.
- [ ] The Drive folder is private; do not use “anyone with the link”.
- [ ] Backups contain staff PINs and the local owner password in demo mode.
- [ ] Restrict the Apps Script deployment to the workshop Google account.
- [ ] Rotate the secret when a device or staff member leaves.
- [ ] Test a restore into a spare workshop before relying on the backup.
- [ ] Keep Supabase point-in-time recovery or `pg_dump` alongside the JSON
      snapshot for production data.

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Add the Google Drive backup webhook URL` | URL missing | Save the webhook URL in Settings |
| `Add the Google Drive backup secret key` | Key missing | Save the same secret as the script |
| `Unauthorised backup key` | Secret mismatch | Re-copy the secret into both places |
| HTTP 401/403 | Apps Script deployment not public, or folder not shared | Redeploy with access “Anyone”; share the folder with the service account |
| `DriveApp.getFolderById` fails | Wrong folder ID or script account has no access | Copy the folder ID again and open the folder with the script account |
| Backup never runs automatically | App was closed at the backup hour | Launch the app; it catches up, or add a server-side schedule |
| Large backup fails | Embedded photos exceed the request limit | Move photos to Drive/Supabase Storage and keep JSON snapshots lean |
