import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const file = () =>
  path.resolve(process.cwd(), process.env.DATA_FILE || "data/store.json");
const blank = () => ({
  users: [],
  policies: [],
  amendments: [],
  reductions: [],
  claims: [],
  audits: [],
});
export const load = () => {
  const p = file();
  if (!fs.existsSync(p)) return blank();
  return JSON.parse(fs.readFileSync(p, "utf8"));
};
export const save = (db) => {
  const p = file();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const temp = p + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(temp, p);
};
export const id = () => crypto.randomUUID();
export const stamp = () => new Date().toISOString();
export const audit = (db, by, action, target) =>
  db.audits.push({ id: id(), by, action, target, at: stamp() });
export const get = (db, collection, identity) =>
  db[collection].find((x) => x.id === identity);
