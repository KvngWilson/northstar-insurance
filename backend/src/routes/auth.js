import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { load, save, stamp } from "../services/db.js";
import { fail, requiredString, safe } from "../utils/errors.js";
import { userPublic } from "../config/roles.js";
import { authenticate } from "../middleware/auth.js";
export const auth = Router();
auth.post(
  "/login",
  safe((req, res) => {
    const username = requiredString(req.body?.username, "username", 100);
    const password = requiredString(req.body?.password, "password", 255);
    const db = load();
    const u = db.users.find(
      (x) => x.username.toLowerCase() === username.toLowerCase(),
    );
    if (
      !u ||
      u.status !== "active" ||
      !bcrypt.compareSync(password, u.passwordHash)
    )
      fail(401, "Invalid credentials");
    u.lastLogin = stamp();
    save(db);
    const token = jwt.sign(
      { sub: u.id, username: u.username, roles: u.roles, ver: u.authVersion },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: process.env.JWT_EXPIRES_IN || "1h" },
    );
    res.json({ token, user: userPublic(u) });
  }),
);
auth.get("/me", authenticate, (req, res) =>
  res.json({ user: userPublic(req.user) }),
);
