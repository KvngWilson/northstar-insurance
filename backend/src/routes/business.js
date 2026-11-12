import { Router } from "express";
import { authenticate, roles, policyVisible } from "../middleware/auth.js";
import { load, save, get, id, stamp, audit } from "../services/db.js";
import {
  fail,
  requiredString,
  amount,
  oneOf,
  isoDate,
  safe,
} from "../utils/errors.js";
export const business = Router();
business.use(authenticate);
const permitted = (db, p, u) => {
  if (!policyVisible(db, p, u)) fail(403, "Not authorized for this policy");
};
const own = (p, u) => {
  if (u.roles.includes("customer") && p.customerId !== u.id)
    fail(403, "Not your policy");
};
const listVisible = (db, name, u) =>
  db[name].filter((x) => {
    const p = name === "policies" ? x : get(db, "policies", x.policyId);
    return p && policyVisible(db, p, u);
  });
const workflow = (
  singular,
  plural,
  scope,
  submitRoles,
  reviewRoles,
  fields,
  validate,
) => {
  business.get(
    "/" + plural,
    roles(...scope),
    safe((req, res) => {
      const db = load();
      res.json({ [plural]: listVisible(db, plural, req.user) });
    }),
  );
  business.post(
    "/" + plural,
    roles(...submitRoles),
    safe((req, res) => {
      const d = req.body || {},
        db = load(),
        p = get(db, "policies", d.policyId);
      if (!p) fail(404, "Policy not found");
      permitted(db, p, req.user);
      own(p, req.user);
      if (p.status !== "active") fail(409, "Policy is not active");
      validate?.(d, p);
      const row = {
        id: id(),
        policyId: p.id,
        requestedBy: req.user.id,
        status: "pending",
        reviewedBy: null,
        reviewComment: "",
        createdAt: stamp(),
        updatedAt: stamp(),
      };
      for (const f of fields) row[f] = d[f];
      db[plural].push(row);
      audit(db, req.user.id, singular + ".create", row.id);
      save(db);
      res.status(201).json({ [singular]: row });
    }),
  );
  business.patch(
    "/" + plural + "/:id/decision",
    roles(...reviewRoles),
    safe((req, res) => {
      const db = load(),
        row = get(db, plural, req.params.id);
      if (!row) fail(404, "Request not found");
      if (row.status !== "pending") fail(409, "Request already decided");
      const decision = oneOf(
        req.body?.decision,
        ["approved", "rejected"],
        "decision",
      );
      const p = get(db, "policies", row.policyId);
      if (!p) fail(404, "Policy missing");
      row.status = decision;
      row.reviewedBy = req.user.id;
      row.reviewComment =
        typeof req.body?.comment === "string"
          ? req.body.comment.slice(0, 1000)
          : "";
      row.updatedAt = stamp();
      if (decision === "approved" && singular === "reduction") {
        p.coverageAmount = row.requestedCoverage;
        p.updatedAt = stamp();
      }
      if (decision === "approved" && singular === "amendment") {
        if (row.requestType === "coverageAmount")
          p.coverageAmount = row.requestedValue;
        p.updatedAt = stamp();
      }
      audit(db, req.user.id, singular + "." + decision, row.id);
      save(db);
      res.json({ [singular]: row });
    }),
  );
};
business.get(
  "/policies",
  safe((req, res) => {
    const db = load();
    res.json({ policies: listVisible(db, "policies", req.user) });
  }),
);
business.get(
  "/policies/:id",
  safe((req, res) => {
    const db = load(),
      p = get(db, "policies", req.params.id);
    if (!p) fail(404, "Policy not found");
    permitted(db, p, req.user);
    res.json({ policy: p });
  }),
);
business.post(
  "/policies",
  roles("agent", "admin"),
  safe((req, res) => {
    const d = req.body || {},
      db = load();
    const customer = get(db, "users", d.customerId);
    if (!customer || !customer.roles.includes("customer"))
      fail(400, "Customer not found");
    const type = oneOf(
        d.insuranceType,
        ["life", "car", "home"],
        "insuranceType",
      ),
      coverageAmount = amount(d.coverageAmount, "coverageAmount"),
      premiumAmount = amount(d.premiumAmount, "premiumAmount");
    if (coverageAmount <= 0) fail(400, "Coverage must exceed zero");
    const effectiveDate = isoDate(d.effectiveDate, "effectiveDate"),
      expiryDate = isoDate(d.expiryDate, "expiryDate");
    if (expiryDate <= effectiveDate)
      fail(400, "Expiry must follow effective date");
    const p = {
      id: id(),
      policyNumber:
        "NS-" +
        Date.now().toString(36).toUpperCase() +
        "-" +
        Math.random().toString(36).slice(2, 6).toUpperCase(),
      customerId: customer.id,
      insuranceType: type,
      coverageAmount,
      premiumAmount,
      currency: "CAD",
      effectiveDate,
      expiryDate,
      status: "active",
      createdBy: req.user.id,
      createdAt: stamp(),
      updatedAt: stamp(),
      details: typeof d.details === "string" ? d.details.slice(0, 1000) : "",
    };
    db.policies.push(p);
    audit(db, req.user.id, "policy.create", p.id);
    save(db);
    res.status(201).json({ policy: p });
  }),
);
workflow(
  "amendment",
  "amendments",
  ["customer", "agent", "underwriter", "service", "compliance", "admin"],
  ["customer", "agent", "admin"],
  ["underwriter", "admin"],
  ["requestType", "currentValue", "requestedValue", "reason"],
  (d, p) => {
    oneOf(d.requestType, ["coverageAmount"], "requestType");
    amount(d.requestedValue, "requestedValue");
    if (d.requestedValue <= 0) fail(400, "Coverage must be positive");
    if (d.currentValue !== p.coverageAmount)
      fail(409, "Current coverage does not match");
    requiredString(d.reason, "reason", 1000);
  },
);
workflow(
  "reduction",
  "reductions",
  ["customer", "agent", "underwriter", "service", "compliance", "admin"],
  ["customer", "agent", "admin"],
  ["underwriter", "admin"],
  ["currentCoverage", "requestedCoverage", "reason"],
  (d, p) => {
    amount(d.requestedCoverage, "requestedCoverage");
    if (
      d.currentCoverage !== p.coverageAmount ||
      d.requestedCoverage >= p.coverageAmount ||
      d.requestedCoverage <= 0
    )
      fail(400, "Reduction must be positive and below current coverage");
    requiredString(d.reason, "reason", 1000);
  },
);
business.get(
  "/claims",
  roles(
    "customer",
    "agent",
    "underwriter",
    "adjuster",
    "service",
    "compliance",
    "admin",
  ),
  safe((req, res) => {
    const db = load();
    res.json({ claims: listVisible(db, "claims", req.user) });
  }),
);
business.post(
  "/claims",
  roles("customer", "admin"),
  safe((req, res) => {
    const d = req.body || {},
      db = load(),
      p = get(db, "policies", d.policyId);
    if (!p) fail(404, "Policy not found");
    permitted(db, p, req.user);
    own(p, req.user);
    if (p.status !== "active") fail(409, "Policy is not active");
    const row = {
      id: id(),
      policyId: p.id,
      submittedBy: req.user.id,
      claimType: requiredString(d.claimType, "claimType", 100),
      incidentDate: isoDate(d.incidentDate, "incidentDate"),
      claimAmount: amount(d.claimAmount, "claimAmount"),
      description: requiredString(d.description, "description", 2000),
      status: "submitted",
      assignedAdjuster: null,
      decisionComment: "",
      createdAt: stamp(),
      updatedAt: stamp(),
    };
    if (row.claimAmount <= 0) fail(400, "Claim amount must be positive");
    db.claims.push(row);
    audit(db, req.user.id, "claim.create", row.id);
    save(db);
    res.status(201).json({ claim: row });
  }),
);
business.patch(
  "/claims/:id/decision",
  roles("adjuster", "admin"),
  safe((req, res) => {
    const db = load(),
      claim = get(db, "claims", req.params.id);
    if (!claim) fail(404, "Claim not found");
    if (claim.status !== "submitted") fail(409, "Claim already decided");
    claim.status = oneOf(
      req.body?.decision,
      ["approved", "rejected"],
      "decision",
    );
    claim.assignedAdjuster = req.user.id;
    claim.decisionComment =
      typeof req.body?.comment === "string"
        ? req.body.comment.slice(0, 1000)
        : "";
    claim.updatedAt = stamp();
    audit(db, req.user.id, "claim." + claim.status, claim.id);
    save(db);
    res.json({ claim });
  }),
);
