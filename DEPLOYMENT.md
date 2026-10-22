# Deployment Guide

Topology this guide produces:

```
Browser  ──HTTPS──>  Vercel (Next.js)  ──HTTPS──>  api.yourdomain.com (PocketBase, on a VPS)
Browser  ──HTTPS (realtime SSE + direct writes)────────────────^
```

The browser talks to PocketBase **directly** too (realtime subscriptions in
`BillingScreen.tsx`, and the bulk CSV import's `pb.collection(...).create()`
calls) — not just through Vercel. That's why PocketBase needs its own public
HTTPS domain, not just an internal address Vercel can reach.

**On CORS**: nothing to configure. Confirmed from PocketBase's own source
(`apis/middlewares_cors.go`, `DefaultCORSConfig.AllowOrigins = []string{"*"}`)
— it allows all origins by default, with `AllowCredentials: false`, which is
exactly right here since this app authenticates to PocketBase with a Bearer
token (`Authorization` header), never cookies, so there's no credentialed
cross-origin cookie problem to solve.

---

## Part 1 — PocketBase on a VPS

### 1.0 Picking where to run it

You named three options — here's the honest trade-off, since PocketBase's
SQLite data (`pb_data/`) needs to survive restarts/redeploys:

| Option | Persistent disk? | Verdict |
|---|---|---|
| **DigitalOcean droplet** (or Hetzner/Linode — same idea) | Yes, it's a real VM's own disk | **Recommended** — full control, cheapest ($4–6/mo), what the rest of this section walks through |
| **Railway** | Yes, via an attached persistent Volume | Viable alternative — see §1.11 |
| **Render free tier** | **No** — free web services have ephemeral storage and sleep after inactivity | **Not viable for PocketBase** — you'd lose `pb_data` on every redeploy/restart. Render's *paid* tier with a persistent disk add-on would work, but at that point it's not meaningfully cheaper than a droplet. |

The rest of Part 1 assumes a DigitalOcean droplet (Ubuntu 22.04/24.04); any
similar VPS provider works identically.

### 1.1 Create the droplet

In the DigitalOcean dashboard: Create → Droplet → Ubuntu 24.04 LTS → the
cheapest plan ($4–6/mo is plenty for a single small shop's traffic) → add
your SSH key → create. Note the droplet's public IP.

### 1.2 Initial server setup

```bash
ssh root@YOUR_SERVER_IP

# A non-root user to run things as, instead of root
adduser deploy
usermod -aG sudo deploy
su - deploy
```

### 1.3 Install PocketBase

```bash
# Check https://github.com/pocketbase/pocketbase/releases for the latest —
# pin to whatever you tested locally against (this app's hooks target >=0.23.0).
PB_VERSION="0.23.4"

wget "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip"
sudo mkdir -p /opt/pocketbase
sudo unzip "pocketbase_${PB_VERSION}_linux_amd64.zip" -d /opt/pocketbase
rm "pocketbase_${PB_VERSION}_linux_amd64.zip"
sudo chown -R deploy:deploy /opt/pocketbase
```

### 1.4 Deploy the custom hooks

The atomic invoice route and stock/credit hooks (`POCKETBASE_SETUP.md`
§7A/§7B) **must** be present or the billing screen's Finalize action will
404 on `/api/custom/create-invoice`:

```bash
mkdir -p /opt/pocketbase/pb_hooks
nano /opt/pocketbase/pb_hooks/main.pb.js
# paste the full hook source from POCKETBASE_SETUP.md §7A/§7B, save, exit
```

### 1.5 Run it as a systemd service

Binding to `127.0.0.1` only (not `0.0.0.0`) — PocketBase is never directly
internet-exposed; Caddy (§1.7) is the only thing listening publicly and
proxies to it internally.

`/etc/systemd/system/pocketbase.service`:

```ini
[Unit]
Description=PocketBase
After=network.target

[Service]
Type=simple
User=deploy
Group=deploy
LimitNOFILE=4096
Restart=always
RestartSec=5
WorkingDirectory=/opt/pocketbase
ExecStart=/opt/pocketbase/pocketbase serve --http=127.0.0.1:8090
StandardOutput=append:/var/log/pocketbase/pocketbase.log
StandardError=append:/var/log/pocketbase/pocketbase.log

[Install]
WantedBy=multi-user.target
```

```bash
sudo mkdir -p /var/log/pocketbase
sudo chown deploy:deploy /var/log/pocketbase
sudo systemctl daemon-reload
sudo systemctl enable --now pocketbase
sudo systemctl status pocketbase   # should say "active (running)"
```

### 1.6 Point your domain at it

In whatever DNS provider you use for `yourdomain.com`, add an **A record**:

```
api.yourdomain.com  →  YOUR_SERVER_IP
```

(Using a subdomain like `api.yourdomain.com` for PocketBase, separate from
wherever your marketing site or anything else lives, keeps things clean.)

### 1.7 Caddy — automatic HTTPS, no certbot needed

Caddy gets you Let's Encrypt HTTPS with zero manual certificate management,
which is why it's used here instead of nginx+certbot.

```bash
sudo apt update
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
api.yourdomain.com {
	reverse_proxy 127.0.0.1:8090
}
```

```bash
sudo systemctl reload caddy
```

Caddy automatically requests and renews the certificate the first time it
sees a request for that domain — no further action needed. Visit
`https://api.yourdomain.com/_/` to confirm you get the PocketBase Admin UI
over HTTPS.

### 1.8 Create the production superuser

```bash
cd /opt/pocketbase
./pocketbase superuser upsert owner@yourdomain.com 'A-LONG-RANDOM-PASSWORD-HERE'
```

Use a password manager to generate this — it's the single most powerful
credential in the whole system (§3 below has more on locking this down).

### 1.9 Import the schema

Don't hand-recreate 8 collections + API Rules on production — export what
you already built locally and import it:

1. On your **local** PocketBase Admin UI → Settings → **Export collections**
   → download the JSON.
2. On **production** (`https://api.yourdomain.com/_/`) → Settings →
   **Import collections** → upload that JSON → review the diff it shows you
   → Confirm.

Then create your first real `shops` record and the owner/manager/cashier
`users` records for Syed and Iba's shops, same as the local "Provisioning"
steps in `README.md`.

### 1.10 Automated daily backups

```bash
sudo mkdir -p /opt/backups/pocketbase
nano /opt/pocketbase/backup.sh
```

```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/opt/backups/pocketbase"
mkdir -p "$BACKUP_DIR"

tar -czf "$BACKUP_DIR/pb_data_${TIMESTAMP}.tar.gz" -C /opt/pocketbase pb_data

# keep 14 days of local backups
find "$BACKUP_DIR" -name "pb_data_*.tar.gz" -mtime +14 -delete
```

```bash
chmod +x /opt/pocketbase/backup.sh
crontab -e
```

Add this line (runs daily at 2 AM server time):

```
0 2 * * * /opt/pocketbase/backup.sh >> /var/log/pocketbase/backup.log 2>&1
```

**Important**: local-disk backups alone don't protect you if the droplet
itself is lost/destroyed. Copy backups off the box too — e.g. with
[`rclone`](https://rclone.org/) to S3/Backblaze B2 (`rclone config` once to
set up a remote, then add one line to the script above):

```bash
rclone copy "$BACKUP_DIR/pb_data_${TIMESTAMP}.tar.gz" remote:your-bucket/pocketbase-backups/
```

PocketBase also has a **built-in** backup feature (Admin UI → Settings →
Backups) that can create snapshots and optionally push them to S3-compatible
storage directly — worth exploring as an alternative to the script above if
you'd rather not maintain your own cron job; the script here is the
guaranteed-to-work version since it doesn't depend on verifying that
feature's exact scheduling behavior for your PocketBase version.

**Test the restore path now**, not during an actual incident:

```bash
sudo systemctl stop pocketbase
cd /opt/pocketbase
mv pb_data pb_data.bak
tar -xzf /opt/backups/pocketbase/pb_data_TIMESTAMP.tar.gz
sudo systemctl start pocketbase
# confirm the Admin UI shows your data, then:
rm -rf pb_data.bak
```

### 1.11 Alternative: Railway

Railway supports persistent volumes, so it's a legitimate alternative to a
droplet if you'd rather not manage a VM yourself:

1. New Project → Deploy from a Dockerfile (simplest way to guarantee
   `pb_hooks/main.pb.js` ships with the image — a generic PocketBase
   template may not include your custom hooks):
   ```dockerfile
   FROM alpine:latest
   ARG PB_VERSION=0.23.4
   RUN apk add --no-cache unzip ca-certificates && \
       wget https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip && \
       unzip pocketbase_${PB_VERSION}_linux_amd64.zip -d /pb && \
       rm pocketbase_${PB_VERSION}_linux_amd64.zip
   COPY pb_hooks /pb/pb_hooks
   EXPOSE 8090
   CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
   ```
2. Attach a **Volume** mounted at `/pb/pb_data` (Settings → Volumes) — this
   is the step that makes data survive redeploys; skipping it reproduces
   Render free tier's data-loss problem.
3. Settings → Networking → Custom Domain → add `api.yourdomain.com` and
   follow Railway's CNAME instructions. HTTPS is automatic.
4. Everything from §1.8 onward (superuser, schema import, backups) is the
   same — backups matter even more here since you don't have shell access
   for an ad hoc `tar`; use PocketBase's built-in backup-to-S3 feature or
   Railway's own volume snapshot/backup feature instead of a cron job.

---

## Part 2 — Next.js on Vercel

### 2.1 Push to a Git repo

Vercel deploys from GitHub/GitLab/Bitbucket. If this isn't already pushed:

```bash
git remote add origin https://github.com/YOUR_USERNAME/shop-billing-app.git
git push -u origin main
```

### 2.2 Import the project

**Dashboard** (simplest): vercel.com → Add New → Project → import the repo
→ Vercel auto-detects Next.js → don't deploy yet, set the env var first
(§2.3) → Deploy.

**Or CLI**, if you prefer:

```bash
npm i -g vercel
vercel login
cd shop-billing-app
vercel link       # creates/links a Vercel project for this directory
```

### 2.3 Set the environment variable

This app needs exactly **one** variable in production — confirmed by
grepping the codebase for every `process.env.*` read:
`NEXT_PUBLIC_POCKETBASE_URL` (public), `POCKETBASE_INTERNAL_URL` (server,
optional — only useful when Next.js and PocketBase are co-located, which
they aren't in this topology), and `NODE_ENV` (set automatically by Vercel,
never set this one yourself).

`POCKETBASE_ADMIN_EMAIL`/`POCKETBASE_ADMIN_PASSWORD` from
`.env.local.example` are **not** read anywhere in the running app (only
documented as a placeholder for a future one-time provisioning script) —
don't set them on Vercel. Provisioning shops/users happens directly in the
PocketBase Admin UI (§1.9), not through the Next.js app, so there's no
reason to expose admin credentials to Vercel at all.

**Dashboard**: Project → Settings → Environment Variables →
`NEXT_PUBLIC_POCKETBASE_URL` = `https://api.yourdomain.com` → Production
(and Preview, if you want preview deployments to hit the same backend).

**Or CLI**:

```bash
vercel env add NEXT_PUBLIC_POCKETBASE_URL production
# paste: https://api.yourdomain.com
```

### 2.4 Deploy

```bash
vercel --prod
```

Or just push to `main` — once the project is imported, Vercel redeploys on
every push automatically. Visit the deployment URL (or your own custom
domain, set under Settings → Domains), confirm `/login` works end-to-end
against the production PocketBase.

---

## Part 3 — Production environment variables & hardening

### 3.1 Reference table

| Variable | Where | Public? | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_POCKETBASE_URL` | Vercel | Yes — bundled into client JS | `https://api.yourdomain.com` |
| `POCKETBASE_INTERNAL_URL` | Vercel | — | Not used in this topology; leave unset |
| PocketBase superuser email/password | Nowhere in env vars | — | Only ever entered at `https://api.yourdomain.com/_/login`, generated once via `superuser upsert` (§1.8), stored in a password manager |

### 3.2 Securing the PocketBase Admin UI

- **Strong, unique superuser password** (§1.8) — this account can read/write
  every shop's data across every tenant, bypassing all API Rules. Treat it
  like a database root password, because it is one.
- **Don't reuse this password anywhere else**, and consider a second
  superuser account per person who needs Admin UI access (via `superuser
  create`) instead of sharing one login, so you can revoke one person's
  access without rotating a shared credential.
- **Optional extra layer**: restrict `/_/*` to known IPs at the Caddy level
  if you and your clients have static/predictable IPs — e.g.:
  ```
  api.yourdomain.com {
  	@admin path /_/*
  	handle @admin {
  		@blocked not remote_ip YOUR.HOME.IP.HERE YOUR.OFFICE.IP.HERE
  		respond @blocked 403
  	}
  	reverse_proxy 127.0.0.1:8090
  }
  ```
  This only restricts the *Admin UI/API* path — the `/api/collections/*`
  and `/api/custom/*` endpoints the Next.js app and cashiers' browsers use
  stay open to everyone, as they need to be.

### 3.3 SMTP for password reset emails

**Be aware this app doesn't have a "forgot password" page built yet** —
`app/login/page.tsx` is sign-in only, with no call to PocketBase's
`requestPasswordReset()` anywhere in the codebase. Configuring SMTP now is
useful for two things regardless:

1. **PocketBase's own Admin UI** already has a working "Forgot password"
   link at `/_/login` for superusers, which needs SMTP configured to
   actually send the email.
2. **Future-proofing** — if/when a cashier/owner-facing "forgot password"
   flow gets built in the Next.js app, it would call PocketBase's existing
   `users` auth collection API, which also needs SMTP configured to work.

To configure it: PocketBase Admin UI → Settings → Mail settings. Fill in
your SMTP host/port/username/password/sender address (any provider works —
e.g. a transactional email service like Resend, Postmark, or SES, or even
Gmail SMTP with an app password for low volume) and send a test email to
confirm. This is configured **inside PocketBase itself**, not as a Vercel
or droplet environment variable — PocketBase stores it in its own settings,
not in `pb_hooks` or env vars.
