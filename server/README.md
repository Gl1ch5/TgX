# TeleX mod store API

Backend for the in-app mod store: publish mods from the app, search, categories, likes, 1-5 star ratings, download counters, recommendations.
Zero dependencies, Node 18+, one JSON file for data. The app works without it (it falls back to the built-in catalog), so the server is optional.

## Deploy

The app talks to `https://grzxk.ru:8443/api` by default (the certificate of the existing site is reused; no DNS changes, the existing nginx config is not touched, the new one is a separate file that is reverted if `nginx -t` fails). TCP port 8443 must be open in the server firewall / hosting panel.

**Option A — one line on the server** (SSH, or the web console of the hosting panel; works from a phone):
```
git clone --depth 1 -b ccr-297b0b47-05qrmt https://github.com/Gl1ch5/TgX /tmp/tgx && sudo TLS_HOST=grzxk.ru bash /tmp/tgx/server/install.sh
```
Re-running updates the code and keeps the data. The script prints the admin token (needed only to remove other people's mods).

**Option B — GitHub Actions.** Repository, Settings, Secrets and variables, Actions: add `DEPLOY_HOST`, `DEPLOY_USER` (root) and `DEPLOY_PASSWORD` **or** `DEPLOY_SSH_KEY`. Then Actions, **Deploy mod store API**, Run workflow (defaults are right). The last step checks the public address from outside.

**Own sub-domain instead:** `sudo DOMAIN=api.example.com EMAIL=you@example.com bash install.sh` (nginx on :80 + certbot) and set `telex.storeApi` / `STORE_API` accordingly.

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
