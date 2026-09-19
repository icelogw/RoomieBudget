# RoomieBudget

Shared bills for a household. One person pays, the app works out what everyone
else owes, and chases them about it by email.

Self-hosted, single container, SQLite. Built for a sharehouse of two to five
people on a home server.

- Bills split evenly, by exact amounts, by percentage, or assigned to one person
- Recurring bills — rent fortnightly, power quarterly — issued automatically
- Balances netted to one figure per pair, with one-tap settle-up
- No-reply email for new bills, reminders, overdue notices and invites
- Separate layouts for phone and desktop
- CSV export of the whole history

Amounts are AUD, dates are DD/MM/YYYY, and the container's timezone is the
household's.

**It does not move money.** There is no payment processing, no bank connection
and no card handling. It records who owes what and shows a PayID so people can
transfer it themselves.

## Running it

Requires Docker. Nothing else — Node lives inside the container.

```sh
cp .env.example .env
# Set SESSION_SECRET. Everything else has a working default.
openssl rand -base64 48

docker compose up -d
```

Then open the app, create the first account, and invite your housemates from
**Household**.

The first account created becomes the admin. Once anyone exists, the setup page
closes permanently, so it cannot be used to mint a second admin later.

Signing in lasts thirty days, counted from when you signed in rather than from
when you last used it, so everyone signs in again about once a month.

## Configuration

Everything is environment variables. Only `SESSION_SECRET` is required.

| Variable | Default | What it does |
| --- | --- | --- |
| `SESSION_SECRET` | — | Signs session cookies. **Required.** Changing it signs everyone out |
| `APP_URL` | `http://localhost:3000` | The URL housemates actually open. Used for links in emails, so `localhost` produces links that work for nobody but you |
| `TZ` | `Australia/Sydney` | The household's timezone. Drives due dates and reminders |
| `DATA_DIR` | `/data` | Where the SQLite file lives. Mount this |
| `SMTP_HOST` | — | Leave blank and the app runs normally, just without email. A blank line means unset, not empty |
| `SMTP_PORT` | `587` | |
| `SMTP_SECURE` | `false` | `true` for implicit TLS, usually port 465 |
| `SMTP_USER` / `SMTP_PASSWORD` | — | Omit both for a relay that does not authenticate |
| `MAIL_FROM` | `no-reply@roomiebudget.local` | The address notifications come from. Replies go nowhere by design |
| `UPDATE_CHECK` | `true` | Asks GitHub anonymously whether a newer release exists. `false` makes the app contact nothing outside the house |
| `UPDATE_REPO` | `icelogw/RoomieBudget` | Where to look for releases. Only useful if you forked it |

After starting, check email works: **Household → House settings → Email → Send
a test**. A failure reports the mail server's own error, because
"authentication failed" and "connection refused" need different fixes.

## Backing up

The entire database is one file: `roomiebudget.sqlite` in your mounted volume.

On TrueNAS, point the volume at a dataset and your existing snapshot schedule
covers it. To copy it while the app is running, use SQLite's backup rather than
`cp`, which can catch a write mid-flight:

```sh
docker exec roomiebudget sqlite3 /data/roomiebudget.sqlite ".backup '/data/backup.sqlite'"
```

Restoring is putting the file back and restarting.

## Upgrading

The running version is shown under **Household → House settings → Version**,
along with a note if a newer release exists. The check is anonymous and
read-only, needs no token, and only works while the repository is public — a
private one answers 404, which is reported as "cannot check" rather than
"up to date".

Pull the new image and restart. Migrations run automatically at startup, so
there is no separate step:

```sh
docker compose pull && docker compose up -d
```

Take a backup first. Migrations are one-way.

## Development

Everything runs in Docker, so there is no need for Node on the host and no way
for dev and production to disagree about versions.

```sh
npm run docker:dev      # app on :3000, mail catcher on :8025
npm run docker:dev:down
```

Source is bind-mounted, so edits on the host reload in the container. Outgoing
mail goes to [Mailpit](http://localhost:8025) and never leaves the machine.

```sh
npm test                # 186 tests
npm run typecheck
npm run mail:preview    # send one of each email template to the catcher
npm run seed:demo       # fill ./data-demo with a plausible sharehouse
npm run demo            # serve that on :3001, alongside the real one
```

### How it is put together

Next.js on the App Router, SQLite through Drizzle, Tailwind. One container, no
database sidecar — for a handful of people, a Postgres service is operational
burden with no payoff, and one file means snapshots are backups.

A few decisions that are load-bearing:

**Money is integer cents everywhere.** Splitting uses largest-remainder over
integer weights, so shares always sum to the bill total rather than drifting by
a cent. `src/lib/money.ts`.

**Calendar dates are `YYYY-MM-DD` text, not timestamps.** A due date belongs to
the wall calendar, not to an instant; storing it as epoch millis is how a bill
shows "31/03" to one housemate and "01/04" to another.

**Authorisation is a data-layer call, not middleware.** Middleware authorises by
URL pattern, so a route added without a matching entry is public by default and
nothing warns you. `requireUser()` fails closed instead.

**Bills are voided, never deleted; housemates are deactivated, never removed.**
A financial record that can vanish without trace is not a record.

**The browser never submits computed amounts.** The bill form sends a
description of the split; the server recomputes the shares. A tampered form
cannot store a split that does not reconcile.

## Licence

Personal use only. See [LICENSE](LICENSE).

In short: run it for your own household and change your own copy however you
like. Do not share it, publish it, sell it, or run it as a service for other
people — and that applies to a modified version exactly as it does to this
one.
