# Cloudflare R2 Setup Guide

Peripateticware uses Cloudflare R2 for user file uploads in production. In
development, when `CF_R2_ACCOUNT_ID` is empty, the app falls back to a local
`/app/uploads/` volume — no R2 account needed locally.

---

## 1. Create an R2 Bucket

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2 Object Storage**.
2. Click **Create bucket**.
3. Name it `peripateticware-uploads` (or your preferred name — set `CF_R2_BUCKET_NAME` to match).
4. Choose a region (or leave **Automatic**).

---

## 2. Create an R2 API Token

1. In R2, click **Manage R2 API Tokens** → **Create API Token**.
2. Give it a descriptive name (e.g. `peripateticware-prod`).
3. Permissions: **Object Read & Write** scoped to your bucket.
4. Copy the three values shown — they are only displayed once:
   - **Account ID** → `CF_R2_ACCOUNT_ID`
   - **Access Key ID** → `CF_R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `CF_R2_SECRET_ACCESS_KEY`

---

## 3. Enable a Public URL (optional)

For serving uploaded files directly from R2 without going through your API:

1. Open your bucket → **Settings** → **Public Access**.
2. Enable **R2.dev subdomain** (free, `pub-xxx.r2.dev`) or connect a custom domain.
3. Copy the base URL and set it as `CF_R2_PUBLIC_URL`.

If left blank, the backend serves files through the FastAPI `/uploads/` proxy instead.

---

## 4. Set Environment Variables

Add to your production `.env` (or server secrets manager):

```env
CF_R2_ACCOUNT_ID=your_account_id
CF_R2_ACCESS_KEY_ID=your_access_key_id
CF_R2_SECRET_ACCESS_KEY=your_secret_access_key
CF_R2_BUCKET_NAME=peripateticware-uploads
CF_R2_PUBLIC_URL=https://pub-xxx.r2.dev   # optional
```

For Docker deployments these are passed through `docker-compose.yml` via `${VAR:-}` substitution.

---

## 5. CORS (future browser-direct uploads)

If you later add client-side direct uploads (presigned URLs), the bucket will need a
CORS rule allowing your frontend domain. Add via R2 bucket → **Settings** → **CORS Policy**:

```json
[{"AllowedOrigins": ["https://yourapp.com"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["*"]}]
```
