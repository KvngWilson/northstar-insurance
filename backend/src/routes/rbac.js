import { Router } from "express";
import { authenticate, roles } from "../middleware/auth.js";
import { load, save, get, stamp, audit } from "../services/db.js";
import { ROLES, userPublic } from "../config/roles.js";
import { fail, oneOf, safe } from "../utils/errors.js";
export const rbac = Router();
rbac.use(authenticate, roles("admin"));
rbac.get("/roles", (req, res) => res.json({ roles: ROLES }));
rbac.get("/assignments", (req, res) =>
  res.json({
    users: load().users.map((u) => ({
      id: u.id,
      username: u.username,
      roles: u.roles,
    })),
  }),
);
rbac.post(
  "/users/:id/roles",
  safe((req, res) => {
    const role = oneOf(req.body?.role, ROLES, "role");
    const db = load(),
      u = get(db, "users", req.params.id);
    if (!u) fail(404, "User not found");
    if (!u.roles.includes(role)) {
      u.roles.push(role);
      u.authVersion++;
      u.updatedAt = stamp();
      audit(db, req.user.id, "rbac.assign", u.id + ":" + role);
      save(db);
    }
    res.json({ user: userPublic(u) });
  }),
);
rbac.delete(
  "/users/:id/roles/:role",
  safe((req, res) => {
    const db = load(),
      u = get(db, "users", req.params.id);
    if (!u) fail(404, "User not found");
    const role = oneOf(req.params.role, ROLES, "role");
    if (req.user.id === u.id && role === "admin")
      fail(400, "Cannot remove own admin role");
    if (u.roles.includes(role)) {
      if (u.roles.length === 1) fail(400, "User must retain one role");
      u.roles = u.roles.filter((r) => r !== role);
      u.authVersion++;
      u.updatedAt = stamp();
      audit(db, req.user.id, "rbac.remove", u.id + ":" + role);
      save(db);
    }
    res.json({ user: userPublic(u) });
  }),
);
