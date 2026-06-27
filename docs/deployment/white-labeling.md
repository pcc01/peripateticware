# White-Labeling Deployment Guide

This guide explains how to deploy Peripateticware under your own brand — your school's name, logo, colors, domain, and email identity — without modifying the application's core logic. All customization points are environment variables, CSS variables, or template files that sit at the edges of the system.

---

## Prerequisites

Before starting, you need:

- **Docker and Docker Compose** installed on your host (Docker Desktop on Windows/macOS; Docker Engine on Linux).
- **A registered domain** you control (e.g. `learn.yourschool.org`). You will point this at your server.
- **A Cloudflare account** with R2 Object Storage enabled. R2 stores all uploaded files (student evidence photos, audio recordings, standards PDFs). Without it, files survive only as long as the container does. See `docs/deployment/r2-setup.md` for the bucket and API token walkthrough.
- **An SMTP provider** for transactional email (account verification, password reset, parent consent notices). Gmail with an App Password works for small deployments; Postmark, SendGrid, or AWS SES are better for institutional scale.
- A copy of the repository and a `.env` file derived from `.env.example`.

---

## Environment Variables to Customize

Copy `.env.example` to `.env` and change the values below. After editing `.env`, always rebuild the backend container to pick up the new values:

```bash
docker compose up -d --force-recreate backend
```

`docker compose restart` does **not** re-read `.env`.

### Identity and branding

| Variable | Purpose | Example |
|---|---|---|
| `EMAIL_FROM_NAME` | Display name in the "From" field of every outbound email | `Lincoln Academy` |
| `EMAIL_FROM` | Sender address (must be authorized by your SMTP provider) | `noreply@lincolnacademy.org` |
| `ADMIN_EMAIL` | Where the platform sends internal alerts (errors, abuse reports). Falls back to `EMAIL_FROM` if left blank. | `tech@lincolnacademy.org` |
| `FRONTEND_URL` | The public URL of your deployment. Used in email links (verification, password reset, consent). Must match your actual domain. | `https://learn.lincolnacademy.org` |

### Security secrets — always rotate before go-live

| Variable | Purpose |
|---|---|
| `SECRET_KEY` | Signs JWT tokens. Default is `dev-secret-key-change-in-production`. Generate with: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `AUDIT_HASH_SALT` | Anonymizes student IDs in the privacy audit log. Same generation command as above. |
| `PLATFORM_API_SECRET` | Guards the `/platform/*` admin routes with a second factor outside the JWT flow. Required in production. |

### Database credentials

| Variable | Default (dev) | Production recommendation |
|---|---|---|
| `DB_USER` | `peripateticware_user` | Change to something specific to your deployment |
| `DB_PASSWORD` | `peripateticware_secure_password_dev` | Generate a strong random password |

### Email (SMTP)

```env
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=noreply@yourschool.org
SMTP_PASSWORD=your-smtp-password
SMTP_USE_TLS=true
EMAIL_DRY_RUN=false
```

`EMAIL_DRY_RUN=true` (the default) prints emails to container logs instead of sending them. Set it to `false` in production or no one will receive verification links.

### Cloudflare R2 storage

```env
CF_R2_ACCOUNT_ID=your_account_id
CF_R2_ACCESS_KEY_ID=your_access_key_id
CF_R2_SECRET_ACCESS_KEY=your_secret_access_key
CF_R2_BUCKET_NAME=yourschool-uploads
CF_R2_PUBLIC_URL=https://pub-xxx.r2.dev   # optional; see r2-setup.md
```

If these are left blank the backend falls back to a local Docker volume (`uploads_dev`). That fallback is safe for development but loses all files on container replacement.

### Runtime environment

```env
ENVIRONMENT=production
DEBUG=False
LOG_LEVEL=WARNING
```

---

## Frontend Branding

The frontend is a Vite + React application served by the `frontend` container. Branding lives in three places.

### App name and page title

The HTML `<title>` and any hardcoded "Peripateticware" strings in the UI are in `frontend/index.html` and in individual page components under `frontend/src/pages/`. Search for the string across the source tree and replace with your brand name:

```bash
grep -rn "Peripateticware" frontend/src/ --include="*.tsx" --include="*.ts"
```

The most visible occurrences are in sidebar navigation components and the login/signup pages.

### Logo

The logo file is referenced in the navigation shell (`frontend/src/layouts/`). Replace the image asset in `frontend/src/assets/` with your own SVG or PNG, then update the `src` attribute in the layout component that imports it. Keeping the same filename avoids updating every import.

### Colors and visual themes

All colors are defined as CSS custom properties in `frontend/src/design-system.css`. The file ships with three themes:

- **Field Guide** (default) — green primary (`#4a7c59`), warm beige background (`#faf7f2`)
- **Terrain** — orange primary (`#d4a574`), light beige background (`#f5f0e6`)
- **Atmosphere** — purple primary (`#a89dd5`), dark background (`#141c17`)

To apply a theme globally, set the `data-direction` attribute on `<body>` in `frontend/index.html`:

```html
<body data-direction="terrain">
```

To create a fully custom color scheme, edit the `:root` block at the top of `design-system.css`. The variables that most affect the look are:

```css
--primary        /* buttons, links, active states */
--primary-light  /* hover states */
--primary-deep   /* pressed / focus rings */
--bg             /* page background */
--surface        /* card backgrounds */
```

Typography uses Google Fonts (Lora for headings, DM Sans for body). To change fonts, replace the `@import` URLs at the top of `design-system.css` and update the `--font-head` and `--font-body` variables.

`frontend/tailwind.config.ts` extends the default Tailwind theme without overriding colors — brand colors come from the CSS variables above, not from Tailwind's config file. If you add utility classes that reference brand colors, add them to `theme.extend.colors` in `tailwind.config.ts` pointing at your CSS variables.

After any frontend file change, rebuild the container:

```bash
docker compose build --no-cache frontend
docker compose up -d frontend
```

---

## Email Templates

All transactional emails are composed in `backend/services/email_service.py`. There is no separate template directory — HTML is built with Python f-strings inside functions such as `send_verification_email`, `send_password_reset_email`, and `send_notification`.

To customize an email template:

1. Open `backend/services/email_service.py`.
2. Find the function for the message you want to change (e.g. `send_verification_email` near line 118).
3. Edit the HTML string assigned to the `html` variable. The footer of each message already substitutes `settings.EMAIL_FROM_NAME`, which is pulled from your `.env`.
4. `FRONTEND_URL` controls the base URL for all action links (verify, reset, consent). Confirm it is set to your public domain.

To change only the sender name and address as they appear in the recipient's inbox, set `EMAIL_FROM_NAME` and `EMAIL_FROM` in `.env`. No code change is needed for those two fields.

---

## Custom Domain Setup

### DNS

Point your domain at your server's IP with an A record:

```
learn.yourschool.org.   A   203.0.113.10
```

If using Cloudflare DNS, a grey-cloud (DNS-only) record is simpler for direct Docker deployments. Enable the orange-cloud proxy only if you understand how it interacts with your TLS termination.

### HTTPS via Caddy

The repository includes Nginx configuration, but Caddy is the lowest-friction path to automatic HTTPS because it obtains and renews Let's Encrypt certificates automatically. To use Caddy, add a service to `docker-compose.yml`:

```yaml
caddy:
  image: caddy:2-alpine
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./Caddyfile:/etc/caddy/Caddyfile
    - caddy_data:/data
    - caddy_config:/config
  networks:
    - peripateticware
  restart: unless-stopped
```

Create a `Caddyfile` in the project root:

```
learn.yourschool.org {
    reverse_proxy /api/* backend:8000
    reverse_proxy /* frontend:3000
}
```

Add the Caddy volumes to the top-level `volumes:` section of `docker-compose.yml`:

```yaml
volumes:
  caddy_data:
  caddy_config:
```

Remove the `ports` mappings from the `backend` (8000) and `frontend` (3000) services so they are no longer directly reachable from outside the Docker network. All traffic should flow through Caddy.

Caddy requires that ports 80 and 443 on your server are reachable from the public internet at first startup so it can complete the ACME challenge. Check certificate issuance with `docker compose logs -f caddy`.

### Updating CORS

When you switch to a custom domain, update `CORS_ORIGINS` so the backend only accepts requests from your domain:

```env
CORS_ORIGINS=["https://learn.yourschool.org"]
```

The development wildcard `["*"]` should not be used in production.

---

## Multi-Tenant vs. Single-Tenant

### Single-tenant (one school, one deployment)

One Docker Compose stack, one PostgreSQL database, one domain, all users in the same organization. This is the recommended starting point. It is the simplest to operate and reason about.

### Multi-tenant (multiple schools, one deployment)

Peripateticware has an `organizations` table and organization-scoped foreign keys on most user and content tables. Each user belongs to an `org_id`, and the backend's ownership checks enforce that users can only see data within their organization.

To add a second tenant (school) to an existing deployment, insert a row into the `organizations` table with the school's name and tier, then create admin user(s) with `org_id` pointing to that row. Teachers and students who sign up under that admin's invite flow are automatically scoped to the organization. There is no Admin UI for creating organizations yet — it requires a direct database insert or a one-off script.

What is **not** isolated per-tenant in a shared stack: the `FRONTEND_URL`, email sender identity, and visual theme are global to the deployment. If different schools need different branding, logos, or sender identities, each school needs its own deployment stack pointing at a separate database. The environment variables described above are per-stack, not per-organization.

---

## Checklist Before Go-Live

**Secrets**
- [ ] `SECRET_KEY` replaced with a 32-byte random hex value (not the dev default)
- [ ] `AUDIT_HASH_SALT` replaced with a 32-byte random hex value
- [ ] `PLATFORM_API_SECRET` set to a strong random secret
- [ ] `DB_PASSWORD` changed from the dev default

**Environment**
- [ ] `ENVIRONMENT=production`
- [ ] `DEBUG=False`
- [ ] `LOG_LEVEL=WARNING` or `ERROR` — not `DEBUG` or `INFO`, which are verbose and may emit PII

**Email**
- [ ] `EMAIL_DRY_RUN=false`
- [ ] SMTP credentials verified by sending a test message
- [ ] `EMAIL_FROM` is authorized by your SMTP provider (SPF and DKIM DNS records in place)
- [ ] `EMAIL_FROM_NAME` set to your school or platform name
- [ ] `FRONTEND_URL` set to your public domain

**Storage**
- [ ] Cloudflare R2 bucket created and all four `CF_R2_*` credentials set
- [ ] R2 API token scoped to Object Read & Write only (not Account-level)

**Networking**
- [ ] HTTPS working and certificate valid
- [ ] Ports 8000 and 3000 not directly exposed to the internet
- [ ] `CORS_ORIGINS` set to your domain, not `["*"]`

**Database**
- [ ] Fresh database initialized before real users sign up: `docker compose down -v && docker compose up -d` (this wipes the demo seed accounts)
- [ ] Automated backup in place (scheduled `pg_dump` or managed PostgreSQL with snapshots)

**Privacy**
- [ ] `ACTIVE_JURISDICTION` set to the appropriate jurisdiction (e.g. `ferpa_us`, `gdpr_eu`, `coppa_us`)
- [ ] `ENABLE_PRIVACY_CHECKS=true`
- [ ] Consent notice copy in the frontend reviewed to reflect your institution's actual data practices
