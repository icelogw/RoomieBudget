import { verify } from "@node-rs/argon2";
import Database from "better-sqlite3";

const db = new Database("/data/roomiebudget.sqlite");
const u = db.prepare("select email, password_hash, is_active from users where email = ?").get("ash@example.com");
console.log("user found :", u?.email, "| active:", u?.is_active);

const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
try {
  console.log("verify     :", await verify(u.password_hash, "demo-password", OPTIONS));
} catch (e) {
  console.log("verify THREW:", e.message);
}
