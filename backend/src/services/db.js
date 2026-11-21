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
const identityFields = {
  users: "userId",
  policies: "policyId",
  amendments: "amendmentId",
  reductions: "reductionId",
  claims: "claimId",
};
const normalize = (db) => {
  // Add the field names used by the lab to old JSON stores without changing UUIDs.
  for (const [collection, alias] of Object.entries(identityFields)) {
    db[collection] ||= [];
    for (const row of db[collection]) row[alias] ||= row.id;
  }
  db.audits ||= [];
  return db;
};
export const load = () => {
  const p = file();
  if (!fs.existsSync(p)) return normalize(blank());
  return normalize(JSON.parse(fs.readFileSync(p, "utf8")));
};
export const save = (db) => {
  normalize(db);
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
