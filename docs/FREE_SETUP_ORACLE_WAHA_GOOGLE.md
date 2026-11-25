# Free WAHA + Google Drive setup for Refresh Automobiles

This is the lowest-cost production-safe setup for the current deployment.

- Frontend: `https://ravsoft-torque-refresh.pages.dev`
- WhatsApp number: `+94786880256` (confirmed dedicated workshop number)
- Google account: `bit.ramyaa@gmail.com`
- WAHA session: `default`
- WAHA host: Oracle Cloud **Always Free** ARM VM + free `sslip.io` HTTPS name
- Google Drive: one private folder + one Google Apps Script web app

> Oracle's free tier is free within a fixed always-free allowance, not truly unlimited. It normally requires a card for identity verification, but the ARM VM can remain free if you stay inside the allowance.

---

## 1. Create the Oracle Always Free VM

1. Sign up at <https://www.oracle.com/cloud/free/>.
2. Choose a region with ARM capacity, for example `UK South`, `Frankfurt` or `Singapore`.
3. Generate an SSH key locally:

```powershell
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\oracle_waha" -N ""
Get-Content "$env:USERPROFILE\.ssh\oracle_waha.pub"
```

4. In Oracle: **Create resource → Compute → Instances → Create instance**.
   - Name: `waha-refresh`
   - Image: `Ubuntu 24.04` (ARM/aarch64)
   - Shape: `VM.Standard.A1.Flex`
   - OCPUs: `2`, Memory: `12 GB`  
     If capacity is unavailable, retry later or try `4 / 24 GB`.
   - SSH key: paste the public key from step 3.
5. Create the instance and copy its public IP, for example `203.0.113.10`.
6. Open the VCN security list / network security group and allow:
   - TCP `22` from your own IP only
   - TCP `80` from `0.0.0.0/0`
   - TCP `443` from `0.0.0.0/0`

The WAHA URL will be:

```text
https://waha-<PUBLIC_IP>.sslip.io
```

For example `https://waha-203.0.113.10.sslip.io`.

---

## 2. Install Docker and WAHA

SSH into the VM:

```powershell
ssh -i "$env:USERPROFILE\.ssh\oracle_waha" ubuntu@<PUBLIC_IP>
```

On the VM:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin curl openssl
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker

mkdir -p ~/waha-refresh/sessions ~/waha-refresh/media
cd ~/waha-refresh
openssl rand -hex 32
```

Copy the generated key. It is the plain WAHA API key and also goes into Torque.

Create `~/waha-refresh/.env`:

```dotenv
WAHA_API_KEY=<PASTE_THE_GENERATED_KEY>
WHATSAPP_DEFAULT_ENGINE=WEBJS
WAHA_DASHBOARD_USERNAME=admin
WAHA_DASHBOARD_PASSWORD=<STRONG_DASHBOARD_PASSWORD>
WAHA_PUBLIC_URL=https://waha-<PUBLIC_IP>.sslip.io
TZ=Asia/Colombo
```

Create `~/waha-refresh/docker-compose.yml`:

```yaml
services:
  waha:
    image: devlikeapro/waha:latest
    container_name: waha-refresh
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    env_file:
      - .env
    volumes:
      - ./sessions:/app/.sessions
      - ./media:/tmp/whatsapp-files
```

Start WAHA:

```bash
cd ~/waha-refresh
docker compose up -d
docker compose logs -f waha
```

---

## 3. Add HTTPS and CORS with Caddy

Install Caddy:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Replace `/etc/caddy/Caddyfile` with:

```caddyfile
waha-<PUBLIC_IP>.sslip.io {
	header {
		Access-Control-Allow-Origin "https://ravsoft-torque-refresh.pages.dev"
		Access-Control-Allow-Headers "Content-Type, X-Api-Key"
		Access-Control-Allow-Methods "GET, POST, OPTIONS"
	}

	@options {
		method OPTIONS
	}

	handle @options {
		respond 204
	}

	reverse_proxy 127.0.0.1:3000
}
```

Validate and reload:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

When the custom frontend domain is added, add a second `Access-Control-Allow-Origin` for it or use the app's final domain instead of the Pages URL.

---

## 4. Pair `+94786880256`

1. Open `https://waha-<PUBLIC_IP>.sslip.io/dashboard`.
2. Log in with the dashboard credentials.
3. Start the `default` session.
4. On the workshop phone: **WhatsApp → Linked devices → Link a device**.
5. Scan the QR code.
6. Wait until the session reports `WORKING`.

Test from your own computer:

```powershell
$body = @{
  session = "default"
  chatId  = "94786880256@c.us"
  text    = "RAVBsoft WAHA test from Refresh Automobiles"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "https://waha-<PUBLIC_IP>.sslip.io/api/sendText" `
  -Headers @{ "X-Api-Key" = "<YOUR_PLAIN_KEY>" } `
  -ContentType "application/json" `
  -Body $body
```

---

## 5. Configure Torque WhatsApp

In the deployed client, sign in as the owner and open:

**Settings → Integrations → WhatsApp**

- Mode: `Self-hosted WAHA gateway`
- Company WhatsApp number: `+94786880256`
- Gateway URL: `https://waha-<PUBLIC_IP>.sslip.io`
- Session: `default`
- API key: the same plain key from `.env`
- Automatic sending: on

Click **Mark connected**. Keep demo mode on until the client signs off.

---

## 6. Google Drive root folder

Sign in to Google Drive with `bit.ramyaa@gmail.com`.

1. Create a private folder named `RAVBsoft Refresh`.
2. Copy the folder ID from its URL:

```text
https://drive.google.com/drive/folders/<FOLDER_ID>
```

This one folder holds:

- daily JSON backups
- `Workshop_Job_Cards/Job_Card_<number>` folders with inspection photos

The account has 15 GB free across Drive, Gmail and Photos. JSON backups are small; photos will eventually need cleanup or a paid Google plan.

---

## 7. Google Apps Script adapter — backups + job folders

Go to <https://script.google.com>, create a new project, and paste:

```javascript
const SHARED_SECRET = 'replace-with-a-long-random-secret';
const DEFAULT_FOLDER_ID = 'replace-with-ravbsoft-refresh-folder-id';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.key !== SHARED_SECRET) {
      return json({ ok: false, message: 'Unauthorised Google Drive key.' });
    }

    if (body.action === 'jobFolder') return createJobFolder(body);
    return saveBackup(body); // default keeps older backup clients working
  } catch (error) {
    return json({ ok: false, message: String(error) });
  }
}

function saveBackup(body) {
  if (!body.filename || !body.content) {
    return json({ ok: false, message: 'filename and content are required.' });
  }
  const folder = DriveApp.getFolderById(body.folderId || DEFAULT_FOLDER_ID);
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
}

function createJobFolder(body) {
  const jobNo = String(body.jobNo || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!jobNo) {
    return json({ ok: false, message: 'jobNo is required.' });
  }

  const root = DriveApp.getFolderById(body.folderId || DEFAULT_FOLDER_ID);
  const jobRoot = getOrCreateFolder(root, 'Workshop_Job_Cards');
  const folder = getOrCreateFolder(jobRoot, 'Job_Card_' + jobNo);

  const files = [];
  for (const photo of body.photos || []) {
    const bytes = Utilities.base64Decode(photo.data || '');
    const blob = Utilities.newBlob(
      bytes,
      photo.mimetype || 'image/jpeg',
      safeName(photo.name || 'photo.jpg'),
    );
    const file = folder.createFile(blob);
    files.push({ id: file.getId(), name: file.getName() });
  }

  return json({
    ok: true,
    message: 'Job folder ready in Google Drive.',
    folderId: folder.getId(),
    folderUrl: folder.getUrl(),
    files: files,
  });
}

function getOrCreateFolder(parent, name) {
  const found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

function safeName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'photo.jpg';
}

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
```

Deploy it:

**Deploy → New deployment → Web app**

- Execute as: **Me**
- Who has access: **Anyone**
- Authorise the script
- Copy the `/exec` URL

The webhook URL is not the secret. The shared secret is checked inside the script. Keep both private and never paste the secret into chat.

---

## 8. Configure Torque Drive backup/photos

In Torque:

**Settings → Data & backup → Daily Google Drive backup**

- Daily backup: `Enabled — upload once a day`
- Backup webhook URL: the Apps Script `/exec` URL
- Secret key: the same `SHARED_SECRET`
- Drive folder ID: the `RAVBsoft Refresh` folder ID, or leave blank to use the script default
- Earliest backup hour: `2`
- Click **Save backup settings**
- Click **Backup now**

Confirm that `refresh-automobiles-backup-YYYY-MM-DD.json` appears in the Drive folder.

After that, accepting a check-in with inspection photos creates `Workshop_Job_Cards/Job_Card_<number>` and uploads the compressed photos there. The job record's Drive folder reference becomes the real Google folder ID.

---

## 9. Troubleshooting

| Problem | Fix |
| --- | --- |
| Oracle ARM shape out of capacity | Retry later, change region, or use 2 OCPU/12 GB instead of 4/24 GB. |
| WAHA dashboard loads but API returns 401 | The `X-Api-Key` in Torque must equal the plain `WAHA_API_KEY` on the VM. |
| Browser says CORS blocked | Confirm the Caddy CORS header includes the exact Torque origin and that OPTIONS returns 204. |
| `sslip.io` certificate fails | Confirm ports 80 and 443 are open in Oracle's security list, then `sudo systemctl reload caddy`. |
| Apps Script returns `Unauthorised Google Drive key` | The secret in Torque must match `SHARED_SECRET`. |
| Apps Script returns folder error | Share the `RAVBsoft Refresh` folder with `bit.ramyaa@gmail.com` and copy the ID again. |
| Photos do not upload | The shared webhook URL must be saved in Torque; the job still succeeds with a demo folder reference until then. |
| Drive quota full | Remove old photos or upgrade Google storage. JSON backups are small. |
