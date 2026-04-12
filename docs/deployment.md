# Deployment Guide

## Prerequisites

- Docker + Docker Compose installed
- A Spotify Developer account (free)
- Your domain pointed to the server (A record → server IP)
- TikTok Sign API key from [tiktokliveconnector.com](https://tiktokliveconnector.com) (free)

---

## 1. Spotify App Setup

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and create an app.
2. Note your **Client ID** and **Client Secret**.
3. Under **Redirect URIs**, add:
   ```
   https://yourdomain.com/auth/spotify/callback
   ```
4. Save.

---

## 2. Environment Variables

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

```
SPOTIFY_CLIENT_ID=<from Spotify dashboard>
SPOTIFY_CLIENT_SECRET=<from Spotify dashboard>
SPOTIFY_CALLBACK_URL=https://yourdomain.com/auth/spotify/callback
TIKTOK_SIGN_API_KEY=<from tiktokliveconnector.com>
PORT=4000
WEB_ORIGIN=https://yourdomain.com
NODE_ENV=production
```

> **Never commit `.env`** — it is already listed in `.gitignore`.

---

## 3. Build & Run (Production)

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

This starts two containers:
- **api** — Node.js backend on internal port 4000 (not exposed to the internet)
- **frontend** — nginx serving the built React app on port 80, proxying `/auth`, `/spotify`, `/requests`, `/settings`, `/tiktok`, `/health`, and `/socket.io/` to the backend

Check both are running:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

---

## 4. HTTPS / TLS

The app itself runs on port 80. TLS termination happens **outside** the containers at the platform/reverse proxy level. Three common setups:

### Railway / Render / Fly.io

These platforms terminate TLS at their load balancer automatically. Just deploy using the `docker-compose.prod.yml` and set the env vars in the platform dashboard. No extra config needed.

### VPS with nginx + Certbot (reverse proxy in front of Docker)

1. Install nginx and certbot on the host.
2. Obtain a certificate:
   ```bash
   sudo certbot --nginx -d yourdomain.com
   ```
3. Add an nginx site config at `/etc/nginx/sites-available/tksq`:
   ```nginx
   server {
       listen 443 ssl;
       server_name yourdomain.com;

       ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

       location / {
           proxy_pass http://127.0.0.1:80;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto https;
       }

       location /socket.io/ {
           proxy_pass http://127.0.0.1:80;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-Proto https;
       }
   }

   server {
       listen 80;
       server_name yourdomain.com;
       return 301 https://$host$request_uri;
   }
   ```
4. Enable and reload:
   ```bash
   sudo ln -s /etc/nginx/sites-available/tksq /etc/nginx/sites-enabled/
   sudo nginx -t && sudo nginx -s reload
   ```

### Cloudflare Tunnel

Set the tunnel target to `http://localhost:80`. Cloudflare terminates TLS for you with a free certificate.

---

## 5. First Login

1. Visit `https://yourdomain.com` — you'll see the viewer (song request) page.
2. Go to `https://yourdomain.com/admin`.
3. Click **Connect Spotify** and complete the OAuth flow.
4. The admin session cookie is set as `httpOnly`, `secure`, `SameSite=Lax` and lasts 7 days.

---

## 6. Updating

```bash
git pull
docker compose -f docker-compose.prod.yml up --build -d
```

Old containers are replaced with zero-downtime (Docker replaces them one at a time). In-memory state (requests, TikTok connection) resets on backend restart — this is expected.

---

## 7. Stopping / Removing

```bash
# Stop containers (preserves images)
docker compose -f docker-compose.prod.yml down

# Stop and remove images
docker compose -f docker-compose.prod.yml down --rmi all
```

---

## 8. Local Dev (reference)

```bash
cp .env.example .env
# set SPOTIFY_CALLBACK_URL=http://127.0.0.1:4000/auth/spotify/callback
# set WEB_ORIGIN=http://localhost:5173
# set NODE_ENV= (leave blank or omit)
docker compose up --build
```

Frontend dev server: `http://localhost:5173`
Backend API: `http://localhost:4000`

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Spotify OAuth redirect fails | Redirect URI mismatch | Add the exact `SPOTIFY_CALLBACK_URL` to the Spotify app dashboard |
| `secure` cookie not sent | Browser blocks secure cookie on HTTP | Use HTTPS in production; for local dev leave `NODE_ENV` unset |
| Socket.io not connecting | `WEB_ORIGIN` mismatch | Ensure `WEB_ORIGIN` matches the exact origin the browser uses |
| `NO_ACTIVE_DEVICE` on approve | No Spotify client open | Open Spotify on any device and play/pause once |
| TikTok connection fails | Invalid sign key or username | Check `TIKTOK_SIGN_API_KEY`; use username without `@` |
| Port 80 already in use | Another service on the host | Change `"80:80"` to e.g. `"8080:80"` in `docker-compose.prod.yml` and update nginx proxy accordingly |
