# Deploying to TrueNAS

Written for TrueNAS SCALE. The app is one container with one volume, so this is
mostly about putting the database somewhere your snapshots already cover.

## 1. Make a dataset for the database

Do not use a directory inside an app's own storage. A dataset of its own means
snapshots, replication and quotas apply to it like anything else you keep.

In the UI: **Datasets → Add Dataset**, somewhere like `tank/apps/roomiebudget`.

The container runs as **uid 1000**, so that dataset must be writable by it:

```sh
chown -R 1000:1000 /mnt/tank/apps/roomiebudget
```

Getting this wrong shows up as the container restarting repeatedly with
`SQLITE_CANTOPEN` in its logs — the app cannot create its database file.

## 2. Build or fetch the image

TrueNAS cannot build from source, so build it elsewhere and push it, or build
on the NAS over SSH:

```sh
git clone <your repo> roomiebudget && cd roomiebudget
docker build -t roomiebudget:latest .
```

## 3. Generate a session secret

```sh
openssl rand -base64 48
```

Keep it. Session ids in the database are derived from it, so changing it signs
everyone out — which is how to cut off access in a hurry if a device goes
missing. Losing it costs one round of signing back in, nothing more.

## 4. Run it

Custom App, or over SSH with compose. The compose file in the repo is the
reference — the parts that matter:

```yaml
services:
  roomiebudget:
    image: roomiebudget:latest
    container_name: roomiebudget
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      SESSION_SECRET: "<the secret from step 3>"
      APP_URL: "http://truenas.local:3000"
      TZ: "Australia/Sydney"
      SMTP_HOST: "smtp.example.com"
      SMTP_PORT: "587"
      SMTP_USER: "<user>"
      SMTP_PASSWORD: "<password>"
      MAIL_FROM: "no-reply@yourdomain.com"
    volumes:
      - /mnt/tank/apps/roomiebudget:/data
```

`APP_URL` must be the address your housemates actually type. It is what goes
into email links, so `localhost` produces links that work for nobody but you.

`TZ` must be your real timezone. The image carries tzdata, but if this is unset
the app runs in UTC and due dates land on the wrong day for part of the year.

## 5. Check it came up

```sh
curl http://truenas.local:3000/api/health     # {"status":"ok"}
docker logs roomiebudget | head
```

The startup line reports the configuration it actually loaded:

```
RoomieBudget starting — env=production tz=Australia/Sydney data=/data mail=on
```

If `SESSION_SECRET` is missing the container exits immediately and says so,
rather than failing later at somebody's first login.

Then open the app, create the admin account, and send yourself a test email
from **Household → House settings → Email**.

## Reaching it from outside

The app expects to be private. It has session authentication and a login
throttle, but it has not been hardened for the open internet.

**Recommended:** a VPN. Tailscale or WireGuard on the NAS, then use it from
anywhere as though you were home. Set `APP_URL` to the VPN address.

**If you must expose it**, put it behind a reverse proxy with HTTPS and set
`APP_URL` to the `https://` URL — session cookies are marked `secure`
automatically when it starts with `https`, and browsers then refuse to send
them over plain HTTP.

Do not expose port 3000 directly to the internet.

## Backups

The database is one file in your dataset, so a snapshot task on that dataset is
a complete backup. To take a copy while the app is running, use SQLite's own
backup rather than `cp`, which can catch a write mid-flight:

```sh
docker exec roomiebudget sqlite3 /data/roomiebudget.sqlite ".backup '/data/backup.sqlite'"
```

Restoring is stopping the container, putting the file back, and starting it.

## Upgrading

```sh
docker compose pull && docker compose up -d
```

Migrations run at startup, so there is no separate step. Snapshot the dataset
first — migrations are one-way.

## When something is wrong

**Container restarts in a loop.** `docker logs roomiebudget`. Usually either a
missing `SESSION_SECRET` (it says so) or a dataset uid 1000 cannot write to
(`SQLITE_CANTOPEN`).

**Login does nothing, no error.** `APP_URL` says `https://` but the app is
being served over plain HTTP. The cookie is marked `secure`, so the browser
accepts it and then refuses to send it back. Match `APP_URL` to reality.

**Emails never arrive.** Send a test from House settings — it reports the mail
server's own error. Check the mail log:

```sh
docker exec roomiebudget sqlite3 /data/roomiebudget.sqlite \
  "select kind, to_email, sent_at, error from email_log order by rowid desc limit 10;"
```

**Due dates look a day out.** `TZ` is unset or wrong, so the app is working in
UTC. `docker exec roomiebudget date` should print your local time.

**Recurring bills have not appeared.** They are generated on a half-hourly
check, and the first runs at startup. A series only issues from its start date
onward, and a paused one issues nothing.
