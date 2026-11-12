import { Router } from "express";
import bcrypt from "bcryptjs";
import { load, save, id, stamp, audit, get } from "../services/db.js";
import { authenticate, roles } from "../middleware/auth.js";
import { fail, requiredString, oneOf, safe } from "../utils/errors.js";
import { ROLES, userPublic } from "../config/roles.js";
export const users = Router();
users.use(authenticate);
const editable = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "province",
  "postalCode",
  "country",
  "preferredContact",
  "emergencyContactName",
  "emergencyContactPhone",
];
const updateFields = (u, data, admin = false) => {
  for (const key of editable)
    if (Object.hasOwn(data, key)) {
      if (typeof data[key] !== "string" || data[key].length > 200)
        fail(400, `Invalid ${key}`);
      u[key] = data[key].trim();
    }
  if (admin) {
    for (const key of [
      "department",
      "jobTitle",
      "supervisorId",
      "clientCategory",
      "customerNumber",
      "employeeNumber",
      "dateOfBirth",
      "assignedAgentId",
    ])
      if (Object.hasOwn(data, key)) {
        if (typeof data[key] !== "string" || data[key].length > 200)
          fail(400, `Invalid ${key}`);
        u[key] = data[key].trim();
      }
  }
  u.updatedAt = stamp();
};
users.get("/me", (req, res) => res.json({ user: userPublic(req.user) }));
users.patch(
  "/me",
  safe((req, res) => {
    const db = load(),
      u = get(db, "users", req.user.id);
    updateFields(u, req.body || {});
    save(db);
    res.json({ user: userPublic(u) });
  }),
);
users.get("/", roles("admin", "compliance"), (req, res) => {
  const list = load().users.map(userPublic);
  res.json({
    users: req.user.roles.includes("admin")
      ? list
      : list.map((u) => ({
          id: u.id,
          username: u.username,
          roles: u.roles,
          status: u.status,
          firstName: u.firstName,
          lastName: u.lastName,
        })),
  });
});
users.post(
  "/",
  roles("admin"),
  safe((req, res) => {
    const d = req.body || {};
    const username = requiredString(d.username, "username", 100),
      password = requiredString(d.password, "password", 255);
    if (password.length < 10)
      fail(400, "Password must have at least 10 characters");
    const db = load();
    if (
      db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())
    )
      fail(409, "Username exists");
    const rolesIn = Array.isArray(d.roles) ? d.roles : ["customer"];
    if (!rolesIn.length || rolesIn.some((r) => !ROLES.includes(r)))
      fail(400, "Invalid roles");
    const u = {
      id: id(),
      username,
      passwordHash: bcrypt.hashSync(password, 12),
      roles: [...new Set(rolesIn)],
      authVersion: 0,
      status: "active",
      userType: rolesIn.includes("customer") ? "customer" : "staff",
      createdAt: stamp(),
      updatedAt: stamp(),
      lastLogin: null,
    };
    updateFields(u, d, true);
    db.users.push(u);
    audit(db, req.user.id, "user.create", u.id);
    save(db);
    res.status(201).json({ user: userPublic(u) });
  }),
);
users.get(
  "/:id",
  roles("admin", "compliance"),
  safe((req, res) => {
    const u = get(load(), "users", req.params.id);
    if (!u) fail(404, "User not found");
    res.json({
      user: req.user.roles.includes("admin")
        ? userPublic(u)
        : {
            id: u.id,
            username: u.username,
            roles: u.roles,
            status: u.status,
            firstName: u.firstName,
            lastName: u.lastName,
          },
    });
  }),
);
users.patch(
  "/:id",
  roles("admin"),
  safe((req, res) => {
    const db = load(),
      u = get(db, "users", req.params.id);
    if (!u) fail(404, "User not found");
    updateFields(u, req.body || {}, true);
    audit(db, req.user.id, "user.update", u.id);
    save(db);
    res.json({ user: userPublic(u) });
  }),
);
users.patch(
  "/:id/status",
  roles("admin"),
  safe((req, res) => {
    const db = load(),
      u = get(db, "users", req.params.id);
    if (!u) fail(404, "User not found");
    const next = oneOf(req.body?.status, ["active", "disabled"], "status");
    if (req.user.id === u.id && next === "disabled")
      fail(400, "Cannot disable your own account");
    u.status = next;
    u.authVersion++;
    u.updatedAt = stamp();
    audit(db, req.user.id, "user.status", u.id);
    save(db);
    res.json({ user: userPublic(u) });
  }),
);
