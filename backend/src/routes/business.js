import { Router } from "express";
import { authenticate, roles } from "../middleware/auth.js";
import {
  policyVisible,
  resourceVisible,
  mayRequestFor,
} from "../services/access.js";
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
const policyFor = (db, policyId) => {
  const policy = get(db, "policies", policyId);
  if (!policy) fail(404, "Policy not found");
  return policy;
};
const canSeePolicy = (db, policy, user) => {
  if (!policyVisible(db, policy, user))
    fail(403, "Not authorized for this policy");
};
const canSeeRow = (db, collection, row, user) => {
  if (!resourceVisible(db, collection, row, user))
    fail(403, "Not authorized for this record");
};
const restrictedClaim = (claim, user) => {
  const restricted =
    !user.roles.some((role) =>
      ["admin", "customer", "adjuster", "compliance"].includes(role),
    ) && user.roles.some((role) => ["agent", "service"].includes(role));
  // Customer support and agents only need claim status, not private incident narratives/amounts.
  return restricted
    ? {
        id: claim.id,
        claimId: claim.claimId,
        policyId: claim.policyId,
        status: claim.status,
        updatedAt: claim.updatedAt,
      }
    : claim;
};
const listed = (db, collection, user) =>
  db[collection]
    .filter((row) =>
      collection === "policies"
        ? policyVisible(db, row, user)
        : resourceVisible(db, collection, row, user),
    )
    .map((row) => (collection === "claims" ? restrictedClaim(row, user) : row));

business.get(
  "/policies",
  safe((req, res) => {
    const db = load();
    res.json({ policies: listed(db, "policies", req.user) });
  }),
);
business.get(
  "/policies/:id",
  safe((req, res) => {
    const db = load();
    const policy = policyFor(db, req.params.id);
    canSeePolicy(db, policy, req.user);
    res.json({ policy });
  }),
);
business.post(
  "/policies",
  roles("agent", "admin"),
  safe((req, res) => {
    const data = req.body || {},
      db = load();
    const customer = get(db, "users", data.customerId);
    if (
      !customer ||
      customer.status !== "active" ||
      !customer.roles.includes("customer")
    )
      fail(400, "Active customer not found");
    const insuranceType = oneOf(
      data.insuranceType,
      ["life", "car", "home"],
      "insuranceType",
    );
    const coverageAmount = amount(data.coverageAmount, "coverageAmount");
    const premiumAmount = amount(data.premiumAmount, "premiumAmount");
    if (coverageAmount <= 0) fail(400, "Coverage must exceed zero");
    const effectiveDate = isoDate(data.effectiveDate, "effectiveDate");
    const expiryDate = isoDate(data.expiryDate, "expiryDate");
    if (expiryDate <= effectiveDate)
      fail(400, "Expiry must follow effective date");
    if (
      data.details !== undefined &&
      (typeof data.details !== "string" || data.details.length > 1000)
    )
      fail(400, "Invalid policy details");
    const policy = {
      id: id(),
      policyNumber: `NS-${Date.now().toString(36).toUpperCase()}-${id().slice(0, 6).toUpperCase()}`,
      customerId: customer.id,
      insuranceType,
      coverageAmount,
      premiumAmount,
      currency: "CAD",
      effectiveDate,
      expiryDate,
      status: "active",
      createdBy: req.user.id,
      createdAt: stamp(),
      updatedAt: stamp(),
      details: (data.details || "").trim(),
    };
    db.policies.push(policy);
    audit(db, req.user.id, "policy.create", policy.id);
    save(db);
    res.status(201).json({ policy });
  }),
);

const workflow = ({ name, plural, submitRoles, reviewerRoles, validate }) => {
  business.get(
    `/${plural}`,
    roles("customer", "agent", "underwriter", "service", "compliance", "admin"),
    safe((req, res) => {
      const db = load();
      res.json({ [plural]: listed(db, plural, req.user) });
    }),
  );
  business.get(
    `/${plural}/:id`,
    safe((req, res) => {
      const db = load(),
        row = get(db, plural, req.params.id);
      if (!row) fail(404, "Request not found");
      canSeeRow(db, plural, row, req.user);
      res.json({ [name]: row });
    }),
  );
  business.post(
    `/${plural}`,
    roles(...submitRoles),
    safe((req, res) => {
      const data = req.body || {},
        db = load();
      const policy = policyFor(db, data.policyId);
      if (!mayRequestFor(db, policy, req.user))
        fail(403, "Not authorized to request a change");
      if (policy.status !== "active") fail(409, "Policy is not active");
      const values = validate(data, policy);
      if (
        db[plural].some(
          (entry) => entry.policyId === policy.id && entry.status === "pending",
        )
      )
        fail(409, "A request of this type is already pending for this policy");
      const row = {
        id: id(),
        policyId: policy.id,
        requestedBy: req.user.id,
        ...values,
        status: "pending",
        reviewedBy: null,
        reviewComment: "",
        createdAt: stamp(),
        updatedAt: stamp(),
      };
      db[plural].push(row);
      audit(db, req.user.id, `${name}.create`, row.id);
      save(db);
      res.status(201).json({ [name]: row });
    }),
  );
  business.patch(
    `/${plural}/:id/decision`,
    roles(...reviewerRoles),
    safe((req, res) => {
      const db = load(),
        row = get(db, plural, req.params.id);
      if (!row) fail(404, "Request not found");
      if (row.status !== "pending") fail(409, "Request already decided");
      if (row.requestedBy === req.user.id)
        fail(403, "Cannot approve or reject your own request");
      const decision = oneOf(
        req.body?.decision,
        ["approved", "rejected"],
        "decision",
      );
      const comment = req.body?.comment ?? "";
      if (typeof comment !== "string" || comment.length > 1000)
        fail(400, "Invalid review comment");
      const policy = policyFor(db, row.policyId);
      if (policy.status !== "active") fail(409, "Policy is not active");
      if (decision === "approved") {
        const snapshot =
          name === "reduction" ? row.currentCoverage : row.currentValue;
        if (snapshot !== policy.coverageAmount)
          fail(409, "Coverage has changed since the request was filed");
        policy.coverageAmount =
          name === "reduction" ? row.requestedCoverage : row.requestedValue;
        policy.updatedAt = stamp();
      }
      row.status = decision;
      row.reviewedBy = req.user.id;
      row.reviewComment = comment.trim();
      row.updatedAt = stamp();
      audit(db, req.user.id, `${name}.${decision}`, row.id);
      save(db);
      res.json({ [name]: row });
    }),
  );
};
workflow({
  name: "amendment",
  plural: "amendments",
  submitRoles: ["customer", "agent", "service", "admin"],
  reviewerRoles: ["underwriter", "admin"],
  validate: (data, policy) => {
    const requestType = oneOf(
      data.requestType,
      ["coverageAmount"],
      "requestType",
    );
    const requestedValue = amount(data.requestedValue, "requestedValue");
    if (requestedValue <= 0 || requestedValue === policy.coverageAmount)
      fail(400, "Requested coverage must be positive and different");
    if (data.currentValue !== policy.coverageAmount)
      fail(409, "Current coverage does not match");
    return {
      requestType,
      currentValue: policy.coverageAmount,
      requestedValue,
      reason: requiredString(data.reason, "reason", 1000),
    };
  },
});
workflow({
  name: "reduction",
  plural: "reductions",
  submitRoles: ["customer", "agent", "service", "admin"],
  reviewerRoles: ["underwriter", "admin"],
  validate: (data, policy) => {
    const requestedCoverage = amount(
      data.requestedCoverage,
      "requestedCoverage",
    );
    if (
      data.currentCoverage !== policy.coverageAmount ||
      requestedCoverage >= policy.coverageAmount ||
      requestedCoverage <= 0
    )
      fail(400, "Reduction must be positive and below current coverage");
    return {
      currentCoverage: policy.coverageAmount,
      requestedCoverage,
      reason: requiredString(data.reason, "reason", 1000),
    };
  },
});

business.get(
  "/claims",
  roles("customer", "agent", "adjuster", "service", "compliance", "admin"),
  safe((req, res) => {
    const db = load();
    res.json({ claims: listed(db, "claims", req.user) });
  }),
);
business.get(
  "/claims/:id",
  safe((req, res) => {
    const db = load(),
      claim = get(db, "claims", req.params.id);
    if (!claim) fail(404, "Claim not found");
    canSeeRow(db, "claims", claim, req.user);
    res.json({ claim: restrictedClaim(claim, req.user) });
  }),
);
business.post(
  "/claims",
  roles("customer", "service", "admin"),
  safe((req, res) => {
    const data = req.body || {},
      db = load();
    const policy = policyFor(db, data.policyId);
    if (!mayRequestFor(db, policy, req.user))
      fail(403, "Not authorized to submit a claim");
    if (policy.status !== "active") fail(409, "Policy is not active");
    const incidentDate = isoDate(data.incidentDate, "incidentDate");
    if (incidentDate > new Date().toISOString().slice(0, 10))
      fail(400, "Incident date cannot be in the future");
    const claimAmount = amount(data.claimAmount, "claimAmount");
    if (claimAmount <= 0) fail(400, "Claim amount must be positive");
    const claim = {
      id: id(),
      policyId: policy.id,
      submittedBy: req.user.id,
      claimType: requiredString(data.claimType, "claimType", 100),
      incidentDate,
      claimAmount,
      description: requiredString(data.description, "description", 2000),
      status: "submitted",
      assignedAdjuster: null,
      decisionComment: "",
      createdAt: stamp(),
      updatedAt: stamp(),
    };
    db.claims.push(claim);
    audit(db, req.user.id, "claim.create", claim.id);
    save(db);
    res.status(201).json({ claim });
  }),
);
business.patch(
  "/claims/:id/status",
  roles("adjuster", "admin"),
  safe((req, res) => {
    const db = load(),
      claim = get(db, "claims", req.params.id);
    if (!claim) fail(404, "Claim not found");
    if (claim.submittedBy === req.user.id)
      fail(403, "Cannot review your own claim");
    if (claim.status !== "submitted")
      fail(409, "Only submitted claims can enter review");
    const status = oneOf(req.body?.status, ["under_review"], "status");
    claim.status = status;
    claim.assignedAdjuster = req.user.id;
    claim.updatedAt = stamp();
    audit(db, req.user.id, "claim.review", claim.id);
    save(db);
    res.json({ claim });
  }),
);
business.patch(
  "/claims/:id/decision",
  roles("adjuster", "admin"),
  safe((req, res) => {
    const db = load(),
      claim = get(db, "claims", req.params.id);
    if (!claim) fail(404, "Claim not found");
    if (claim.submittedBy === req.user.id)
      fail(403, "Cannot decide your own claim");
    if (!["submitted", "under_review"].includes(claim.status))
      fail(409, "Claim already decided");
    if (
      claim.assignedAdjuster &&
      claim.assignedAdjuster !== req.user.id &&
      !req.user.roles.includes("admin")
    )
      fail(403, "Claim assigned to another adjuster");
    const decision = oneOf(
      req.body?.decision,
      ["approved", "rejected"],
      "decision",
    );
    const comment = req.body?.comment ?? "";
    if (typeof comment !== "string" || comment.length > 1000)
      fail(400, "Invalid decision comment");
    claim.status = decision;
    claim.assignedAdjuster = req.user.id;
    claim.decisionComment = comment.trim();
    claim.updatedAt = stamp();
    audit(db, req.user.id, `claim.${decision}`, claim.id);
    save(db);
    res.json({ claim });
  }),
);
