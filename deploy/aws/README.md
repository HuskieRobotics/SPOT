# SPOT on AWS EC2 (Team 3061)

This recipe sets up SPOT v6 on an EC2 instance, step by step. It takes about an hour the first
time. Afterwards, one command installs a new version, and one command goes back to the previous one.

What runs on the instance:

- **SPOT** itself, plain Node 24 (`next start`), kept running by **pm2**. pm2 restarts it after a
  crash and when the instance reboots.
- **nginx** in front of it, for HTTPS. Its certificate comes from Let's Encrypt (certbot).
- **MongoDB Atlas** holds the data. Nothing about the data lives on the instance, so a lost
  instance loses no scouting.

There is no Docker. Everything below is typed into a terminal on the instance, over SSH, unless it
says otherwise.

## What you need first

- Access to the team's AWS account, with permission to launch EC2 instances.
- A name for the server, such as `spot.example.org`, and access to that domain's DNS. Phones need
  HTTPS to install SPOT and to use the camera, and HTTPS needs a name.
- A MongoDB Atlas cluster, and its connection string for a database user that can read and write.
  The string ends with the database's name: `...mongodb.net/spot?retryWrites=true&w=majority`.
- A TBA read API key (thebluealliance.com, Account), and an admin password you choose.

If v5 already runs on an instance, give v6 its own instance. v6 needs Node 24, and changing the
Node version on v5's instance could break v5 during an event.

Wherever this page says `spot.example.org`, use your server's name.

## 1. Launch the instance (AWS console)

1. EC2, **Launch instance**: **Ubuntu Server 24.04 LTS**, type **t3.small** (2 GB of memory:
   building SPOT needs more than the 1 GB of a t3.micro), and a **20 GB** disk.
2. Key pair: use the team's, or create one and keep the `.pem` file safe.
3. Security group, inbound rules:
   - SSH (22) from your own IP address only;
   - HTTP (80) and HTTPS (443) from anywhere.

   Port 3000, where SPOT itself listens, stays closed: only nginx, on the same machine, talks to
   SPOT.

4. **Elastic IPs**: allocate one and associate it with the instance, so the address survives a
   restart.
5. In the domain's DNS, add an **A record** from `spot.example.org` to the elastic IP.
6. In Atlas, **Network Access**: add the elastic IP.

Connect: `ssh -i team-key.pem ubuntu@spot.example.org`.

## 2. Install the software (once)

```sh
sudo apt update && sudo apt upgrade -y

# Node 24 from NodeSource, the Node.js project's packages for Ubuntu
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot git

# pm2, and its log rotation, so logs never fill the disk
sudo npm install -g pm2
pm2 install pm2-logrotate

# 2 GB of swap, so a build never runs out of memory
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Check: `node -v` prints `v24.` and something, and `pm2 -v` prints a version.

## 3. SPOT's folders

```sh
sudo mkdir -p /srv/spot/releases /srv/spot/shared
sudo chown -R "$USER": /srv/spot
git clone --branch v6 https://github.com/HuskieRobotics/SPOT.git /srv/spot/repo
```

| Folder                      | What it holds                                                           |
| --------------------------- | ----------------------------------------------------------------------- |
| `/srv/spot/repo`            | A copy of the repository, which `update.sh` fetches new versions into   |
| `/srv/spot/releases/<id>`   | Each version built, named by date and commit; the newest three are kept |
| `/srv/spot/current`         | A link to the release that is running                                   |
| `/srv/spot/shared/spot.env` | The secrets, outside every release, so an update never touches them     |

## 4. The secrets

```sh
nano /srv/spot/shared/spot.env
```

Write these three lines with your values (the names are in `.env.example`), then save:

```sh
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/spot?retryWrites=true&w=majority
SPOT_ADMIN_PASSWORD=a long password the scouting admins will type
TBA_API_KEY=the key from thebluealliance.com
```

```sh
chmod 600 /srv/spot/shared/spot.env
```

Only the `ubuntu` user can read it now. Never put these values in the repository.

## 5. HTTPS

Get the certificate while nginx still serves its default page, then put SPOT's configuration in
its place:

```sh
sudo certbot certonly --webroot -w /var/www/html -d spot.example.org \
  --deploy-hook "systemctl reload nginx"

sed 's/spot.example.org/YOUR.SERVER.NAME/g' /srv/spot/repo/deploy/aws/nginx/spot.conf |
  sudo tee /etc/nginx/sites-available/spot >/dev/null
sudo ln -sf /etc/nginx/sites-available/spot /etc/nginx/sites-enabled/spot
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` must say the configuration is OK. certbot renews the certificate by itself before it
expires, and reloads nginx when it does.

[`nginx/spot.conf`](nginx/spot.conf) explains each setting. The ones SPOT depends on:

- `/api/scouter/stream` is unbuffered and stays open for an hour (ADR 0001). Each signed-in
  scouter's phone holds one of these streams open. A buffered stream delays assignments, and a
  short timeout keeps cutting phones off.
- Every request carries `X-Forwarded-Proto`, so SPOT knows a request came over HTTPS and marks the
  admin cookie `Secure` (SEC-4a).

## 6. The first release

```sh
/srv/spot/repo/deploy/aws/update.sh
```

It builds SPOT in a new release folder, which takes a few minutes. Then it starts it with pm2 and
waits until the health check answers with the new build.

Then make pm2 start SPOT when the instance boots:

```sh
pm2 startup systemd
```

It prints one `sudo env PATH=...` command: copy it and run it. Then `pm2 save`.

Open `https://spot.example.org`. Sign in at `/admin` with the admin password, and create the event.

## 7. Check it

From your own computer, in a copy of the repository:

```sh
npm run deploy:check -- https://spot.example.org
```

The check takes about 90 seconds. It checks four things:

- SPOT and its database answer;
- HTTP goes to HTTPS;
- a stream arrives as it is sent, and stays open past a minute with long quiet gaps;
- with `SPOT_ADMIN_PASSWORD` set in your terminal's environment, the admin cookie is `Secure`.

Set the password in the environment, never on the command line, where the shell would keep it.
Each failure says what to fix.

## Updating

```sh
/srv/spot/repo/deploy/aws/update.sh          # the v6 branch
/srv/spot/repo/deploy/aws/update.sh my-branch # another branch, to try it
```

The running release keeps serving while the new one builds. To switch, SPOT stops: it saves the
scouters' assignments, and their phones reconnect within seconds. Then the new release starts. If
the new release doesn't answer within two minutes, the script goes back to the previous one by
itself, and prints the logs.

At an event, update between matches. Phones keep scouting through the restart. Matches finished
during it are sent when their phone reconnects.

The season's configuration files are part of the release. To change them, change them in the
repository, as the Configuration Guide describes, and update. An edit made on the server is lost
at the next update.

## Going back

```sh
/srv/spot/repo/deploy/aws/rollback.sh
```

It starts the release before the running one. Run it again to go back one more. The newest three
releases are kept.

## Logs and status

| To see                   | Type                                       |
| ------------------------ | ------------------------------------------ |
| Whether SPOT is running  | `pm2 status`                               |
| SPOT's log as it happens | `pm2 logs spot` (Ctrl+C to stop watching)  |
| The last 200 lines       | `pm2 logs spot --lines 200 --nostream`     |
| The health check         | `curl -s http://127.0.0.1:3000/api/health` |
| Which release is running | `cat /srv/spot/current/RELEASE`            |
| nginx's errors           | `sudo tail -n 50 /var/log/nginx/error.log` |

The log files themselves are in `~/.pm2/logs/`. pm2-logrotate rotates them at 10 MB and keeps 30.

## Stopping and starting

`pm2 stop spot` and `pm2 start spot`. A stop saves the registry first, so scouters keep their
robots (`src/server/shutdown.ts`). pm2 waits up to 10 s for it (`kill_timeout` in
[`ecosystem.config.cjs`](ecosystem.config.cjs)). Don't use `pm2 kill` or `kill -9` during an
event: they don't wait.

## Why pm2's settings are what they are

[`ecosystem.config.cjs`](ecosystem.config.cjs), and `tests/unit/deploy.test.ts` keeps these from
changing by mistake:

- **One process, in fork mode.** The registry of scouters and their robots lives in that process's
  memory (AR-21). pm2's cluster mode, or a second instance, would split it.
- **`NEXT_MANUAL_SIG_HANDLE=true`** and **`kill_timeout` of 10 s.** pm2 stops a process with SIGINT,
  then kills it after `kill_timeout` (1.6 s unless set). Next's own handler waits for every open
  connection to close, and a scouter's stream never closes on its own, so pm2 would kill SPOT
  before it saved anything. With this setting, SPOT handles the signal itself: it closes the
  streams, saves the registry within 8 s, and exits.
- **`--env-file`.** Node reads the secrets from `/srv/spot/shared/spot.env` before SPOT starts.
- **`--hostname 127.0.0.1`.** SPOT answers only nginx, never the internet directly.
