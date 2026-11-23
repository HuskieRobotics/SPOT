# Deploy SPOT on AWS EC2 (Node + nginx)

SPOT runs as **one** long-running Node process. It keeps the live scouter registry
(who is scouting which robot) in memory, so do not run more than one instance.

## 1. Server

Ubuntu 22.04+ on any small instance (t3.small is plenty for 6 scouters and a few admins).

```sh
# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm install -g pm2

git clone https://github.com/HuskieRobotics/SPOT.git && cd SPOT
npm ci
npm run build
```

## 2. Settings

Create `.env.local` in the repo root (or `config/config.json`, see `config/config.example.json`):

```sh
DATABASE_URL=mongodb+srv://user:pass@cluster.mongodb.net/spot
ACCESS_CODE=choose-a-strong-code
TBA_API_KEY=your-tba-read-key
TBA_EVENT_KEY=2027ilch
```

Everything else (active event, project, field orientation…) is set in the app at `/admin`.

## 3. Run with pm2

```sh
PORT=8080 pm2 start npm --name spot -- start
pm2 save && pm2 startup   # restart on reboot
```

## 4. nginx (HTTPS in front)

`/etc/nginx/sites-available/spot`:

```nginx
server {
  server_name spot.example.org;
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
  }
}
```

```sh
sudo ln -s /etc/nginx/sites-available/spot /etc/nginx/sites-enabled/
sudo certbot --nginx -d spot.example.org   # HTTPS is required for the PWA and the QR camera
sudo systemctl reload nginx
```

## Updating

```sh
git pull && npm ci && npm run build && pm2 restart spot
```

Scouter phones poll every 2 seconds, so a restart only interrupts live assignment briefly;
matches being scouted are kept on the phones and upload when the server is back.
