# TeleX mod store API

Backend for the in-app mod store: publish mods from the app, search, categories, likes, 1-5 star ratings, download counters, recommendations.
Zero dependencies, Node 18+, one JSON file for data. The app works without it (it falls back to the built-in catalog), so the server is optional.

## Deploy

**Option A — GitHub Actions (nothing to type on the server).** Repository → Settings → Secrets and variables → Actions → add:

| secret | value |
|---|---|
| `DEPLOY_HOST` | server IP or host |
| `DEPLOY_USER` | `root` (or a sudo user) |
| `DEPLOY_PASSWORD` **or** `DEPLOY_SSH_KEY` | password, or a private key |

Then Actions → **Deploy mod store API** → Run workflow (domain: `api.telex-web.ru`, email for HTTPS). Create the DNS **A record** `api` → the server IP first.

**Option B — by hand on the server:**
```
git clone https://github.com/Gl1ch5/TgX && cd TgX/server
sudo DOMAIN=api.telex-web.ru EMAIL=you@example.com bash install.sh
```
Re-running updates the code and keeps the data. The script prints the admin token.

## API (all JSON, prefix `/api`)

| method | path | |
|---|---|---|
| GET | `/home?installed=a,b` | featured, recommended, trending, newest, categories |
| GET | `/mods?q=&category=&sort=popular\|new\|top\|downloads&limit=&offset=` | search |
| GET | `/mods/:id` | details (with `liked`, `myRating` for the `X-Device`) |
| GET | `/mods/:id/file` | the `.module` text |
| POST | `/mods` `{ module, authorName? }` + `X-Author-Token` | publish / update (the token owns the id) |
| POST | `/mods/:id/like` `{ on }`, `/rate` `{ value 1-5 }`, `/download`, `/report` `{ reason }` | need `X-Device` |
| DELETE | `/mods/:id` | `X-Author-Token` (owner) or `X-Admin-Token` |

Safety: files that read the Telegram session or app secrets are rejected; eval / remote scripts / external network calls are flagged and shown in the app;
3 reports from different devices hide a mod; 10 publications per hour per IP. Mods from the store are never marked "verified" (only the project's own are).

Test: `node test.js`. Environment: `PORT`, `HOST`, `DATA_DIR`, `ADMIN_TOKEN`.
