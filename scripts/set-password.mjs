/**
 * Set a housemate's password from outside the app.
 *
 * There is no reset-by-email flow, and deliberately so: mail is optional and
 * plenty of deployments have no relay, so a recovery path that depends on one
 * would not be a recovery path. The setup page also closes for good once
 * anybody exists, so a sole admin who forgets their password would otherwise
 * have no way back in but editing SQLite by hand.
 *
 *   docker exec -it roomiebudget node scripts/set-password.mjs ash@example.com
 *
 * Plain JavaScript rather than TypeScript because it runs inside the runtime
 * image, which carries the traced bundle and no toolchain.
 */

import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";

import Database from "better-sqlite3";
import { hash } from "@node-rs/argon2";

/**
 * Must match src/lib/auth/password.ts. Hashing with different parameters here
 * would produce a password the app cannot verify, so if those change, change
 * these.
 */
const ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

const MIN_PASSWORD_LENGTH = 10;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Mirrors src/lib/ids.ts, for the audit row. */
function newId(length = 16) {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function usage() {
  console.error("Usage: node scripts/set-password.mjs <email> [new-password]");
  console.error("Leave the password off to be asked for it without it reaching your shell history.");
  process.exit(2);
}

async function promptForPassword() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("New password: ");
    return answer;
  } finally {
    rl.close();
  }
}

async function main() {
  const [email, given] = process.argv.slice(2);
  if (!email) usage();

  const dataDir = process.env.DATA_DIR ?? "/data";
  const file = path.join(dataDir, "roomiebudget.sqlite");

  const db = new Database(file);
  db.pragma("foreign_keys = ON");

  const user = db
    .prepare("select id, name, email, is_active from users where lower(email) = lower(?)")
    .get(email);

  if (!user) {
    console.error(`No account with the email ${email}.`);
    console.error("Accounts on this database:");
    for (const row of db.prepare("select email, name from users order by name").all()) {
      console.error(`  ${row.email}  (${row.name})`);
    }
    process.exit(1);
  }

  const password = given ?? (await promptForPassword());

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    console.error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  const passwordHash = await hash(password, ARGON2);

  db.transaction(() => {
    db.prepare("update users set password_hash = ?, is_active = 1 where id = ?").run(
      passwordHash,
      user.id,
    );

    // Anyone holding a session for this account loses it, which is the point:
    // this is run when access needs to be taken back.
    db.prepare("delete from sessions where user_id = ?").run(user.id);

    // actor_id is null because an operator at a shell is nobody in the app.
    db.prepare(
      "insert into audit_log (id, actor_id, action, entity_type, entity_id, detail, created_at)" +
        " values (?, null, 'password.set_by_operator', 'user', ?, ?, ?)",
    ).run(newId(), user.id, JSON.stringify({ email: user.email }), Date.now());
  })();

  console.log(`Password set for ${user.name} <${user.email}>.`);
  if (!user.is_active) console.log("The account was deactivated and has been switched back on.");
  console.log("Any existing sign-in for that account has been ended.");
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
