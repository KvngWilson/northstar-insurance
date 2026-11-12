import jwt from "jsonwebtoken";
import { load } from "../services/db.js";
import { fail } from "../utils/errors.js";
export const authenticate = (req, res, next) => {
  const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || "");
  if (!match) fail(401, "Missing bearer token");
  let payload;
  try {
    payload = jwt.verify(match[1], process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch {
    fail(401, "Invalid or expired token");
  }
  const user = load().users.find((u) => u.id === payload.sub);
  if (!user || user.status !== "active" || user.authVersion !== payload.ver)
    fail(401, "Account or token is no longer active");
  req.user = user;
  next();
};
export const roles =
  (...allowed) =>
  (req, res, next) => {
    if (!req.user.roles.some((r) => allowed.includes(r)))
      fail(403, "Insufficient role");
    next();
  };
export const selfOrAdmin = (req, res, next) => {
  if (req.user.id !== req.params.id && !req.user.roles.includes("admin"))
    fail(403, "Cannot access another user");
  next();
};
export const customerOwns = (db, policy, actor) => {
  if (!policy) fail(404, "Policy not found");
  if (actor.roles.includes("customer") && policy.customerId !== actor.id)
    fail(403, "Not your policy");
};
export const policyVisible = (db, policy, actor) => {
  if (!policy) fail(404, "Policy not found");
  const r = actor.roles;
  if (r.includes("admin")) return true;
  if (r.includes("customer")) return policy.customerId === actor.id;
  if (r.includes("agent"))
    return (
      policy.createdBy === actor.id ||
      db.users.find((u) => u.id === policy.customerId)?.assignedAgentId ===
        actor.id
    );
  if (
    r.some((x) =>
      ["underwriter", "adjuster", "service", "compliance"].includes(x),
    )
  )
    return true;
  return false;
};
