import { Router } from "express";
import { authenticate, roles } from "../middleware/auth.js";
import { load } from "../services/db.js";
export const audits = Router();
audits.use(authenticate, roles("admin", "compliance"));
audits.get("/", (req, res) => {
  const events = load().audits;
  // Audit events contain opaque record identifiers
  res.json({ audits: events.slice(-200).reverse() });
});
