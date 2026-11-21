import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import bcrypt from "bcryptjs";
import request from "supertest";
import { app } from "../src/app.js";
let dir,
  tokens = {},
  ids = {},
  policyId;
const api = request(app);
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-test-"));
  process.env.DATA_FILE = path.join(dir, "store.json");
  process.env.JWT_SECRET = "test-secret-for-tests-longer-than-32-characters";
  const roles = [
    "admin",
    "customer",
    "customer2",
    "agent",
    "underwriter",
    "adjuster",
    "service",
    "compliance",
  ];
  const db = {
    users: [],
    policies: [],
    amendments: [],
    reductions: [],
    claims: [],
    audits: [],
  };
  for (const role of roles) {
    ids[role] = role;
    db.users.push({
      id: role,
      username: role,
      passwordHash: bcrypt.hashSync("DemoPass123!", 4),
      roles: [role === "customer2" ? "customer" : role],
      authVersion: 0,
      status: "active",
      firstName: role,
      lastName: "Test",
    });
  }
  policyId = "sample";
  db.policies.push({
    id: policyId,
    policyNumber: "NS-TEST",
    insuranceType: "life",
    customerId: "customer",
    coverageAmount: 100000,
    premiumAmount: 1000,
    status: "active",
    createdBy: "agent",
  });
  fs.writeFileSync(process.env.DATA_FILE, JSON.stringify(db));
  for (const role of roles) {
    let r = await api
      .post("/api/auth/login")
      .send({ username: role, password: "DemoPass123!" });
    assert.equal(r.status, 200);
    tokens[role] = r.body.token;
  }
});
const bearer = (r) => ({ Authorization: `Bearer ${tokens[r]}` });
test("login rejects wrong password", async () => {
  const r = await api
    .post("/api/auth/login")
    .send({ username: "customer", password: "wrong" });
  assert.equal(r.status, 401);
});
test("protected route rejects no token", async () => {
  assert.equal((await api.get("/api/users/me")).status, 401);
});
test("protected route rejects invalid token", async () => {
  assert.equal(
    (await api.get("/api/users/me").set("Authorization", "Bearer bogus"))
      .status,
    401,
  );
});
test("customer can view own profile", async () => {
  const r = await api.get("/api/users/me").set(bearer("customer"));
  assert.equal(r.status, 200);
  assert.equal(r.body.user.id, "customer");
  assert.equal(r.body.user.passwordHash, undefined);
});
test("customer cannot view other user profile", async () => {
  assert.equal(
    (await api.get("/api/users/customer2").set(bearer("customer"))).status,
    403,
  );
});
test("admin lists users, customer cannot", async () => {
  assert.equal((await api.get("/api/users").set(bearer("admin"))).status, 200);
  assert.equal(
    (await api.get("/api/users").set(bearer("customer"))).status,
    403,
  );
});
test("non-admin cannot assign role", async () => {
  assert.equal(
    (
      await api
        .post("/api/rbac/users/customer/roles")
        .set(bearer("customer"))
        .send({ role: "admin" })
    ).status,
    403,
  );
});
test("customer only sees own policies", async () => {
  const a = await api.get("/api/policies").set(bearer("customer"));
  const b = await api.get("/api/policies").set(bearer("customer2"));
  assert.equal(a.body.policies.length, 1);
  assert.equal(b.body.policies.length, 0);
  assert.equal(
    (await api.get("/api/policies/sample").set(bearer("customer2"))).status,
    403,
  );
});
test("agent creates policy", async () => {
  const r = await api.post("/api/policies").set(bearer("agent")).send({
    customerId: "customer",
    insuranceType: "car",
    coverageAmount: 25000,
    premiumAmount: 900,
    effectiveDate: "2026-02-01",
    expiryDate: "2027-02-01",
  });
  assert.equal(r.status, 201);
});
test("underwriter decision and non-underwriter refusal", async () => {
  const created = await api
    .post("/api/amendments")
    .set(bearer("customer"))
    .send({
      policyId: "sample",
      requestType: "coverageAmount",
      currentValue: 100000,
      requestedValue: 130000,
      reason: "More protection",
    });
  assert.equal(created.status, 201);
  const id = created.body.amendment.id;
  assert.equal(
    (
      await api
        .patch(`/api/amendments/${id}/decision`)
        .set(bearer("customer"))
        .send({ decision: "approved" })
    ).status,
    403,
  );
  assert.equal(
    (
      await api
        .patch(`/api/amendments/${id}/decision`)
        .set(bearer("underwriter"))
        .send({ decision: "approved" })
    ).status,
    200,
  );
});
test("customer submits claim; only adjuster can decide", async () => {
  const r = await api.post("/api/claims").set(bearer("customer")).send({
    policyId: "sample",
    claimType: "incident",
    incidentDate: "2026-05-10",
    claimAmount: 1000,
    description: "Sample incident",
  });
  assert.equal(r.status, 201);
  const id = r.body.claim.id;
  assert.equal(
    (
      await api
        .patch(`/api/claims/${id}/decision`)
        .set(bearer("agent"))
        .send({ decision: "approved" })
    ).status,
    403,
  );
  assert.equal(
    (
      await api
        .patch(`/api/claims/${id}/decision`)
        .set(bearer("adjuster"))
        .send({ decision: "rejected" })
    ).status,
    200,
  );
});
test("admin assigns role and revokes old token", async () => {
  const r = await api
    .post("/api/rbac/users/customer2/roles")
    .set(bearer("admin"))
    .send({ role: "agent" });
  assert.equal(r.status, 200);
  assert.ok(r.body.user.roles.includes("agent"));
  assert.equal(
    (await api.get("/api/users/me").set(bearer("customer2"))).status,
    401,
  );
});
test("admin deactivates user and rejects old token", async () => {
  const r = await api
    .patch("/api/users/service/status")
    .set(bearer("admin"))
    .send({ status: "disabled" });
  assert.equal(r.status, 200);
  assert.equal(
    (await api.get("/api/users/me").set(bearer("service"))).status,
    401,
  );
});

test("customer cannot edit security-sensitive profile fields", async () => {
  const response = await api
    .patch("/api/users/me")
    .set(bearer("customer"))
    .send({ roles: ["admin"], status: "active" });
  assert.equal(response.status, 400);
  assert.equal(
    (await api.get("/api/users/me").set(bearer("customer"))).body.user
      .authVersion,
    undefined,
  );
});
test("non-admin cannot read audit events and compliance can", async () => {
  assert.equal(
    (await api.get("/api/audits").set(bearer("customer"))).status,
    403,
  );
  const response = await api.get("/api/audits").set(bearer("compliance"));
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.audits));
});
test("underwriter cannot list claims", async () => {
  assert.equal(
    (await api.get("/api/claims").set(bearer("underwriter"))).status,
    403,
  );
});
test("agent is blocked from unassigned customer policies and requests", async () => {
  const created = await api.post("/api/policies").set(bearer("admin")).send({
    customerId: "customer2",
    insuranceType: "home",
    coverageAmount: 150000,
    premiumAmount: 1200,
    effectiveDate: "2026-02-01",
    expiryDate: "2027-02-01",
  });
  assert.equal(created.status, 201);
  const policy = created.body.policy;
  assert.equal(
    (await api.get(`/api/policies/${policy.id}`).set(bearer("agent"))).status,
    403,
  );
  assert.equal(
    (
      await api.post("/api/reductions").set(bearer("agent")).send({
        policyId: policy.id,
        currentCoverage: 150000,
        requestedCoverage: 100000,
        reason: "Test",
      })
    ).status,
    403,
  );
});
test("admin-created profiles include all required business fields", async () => {
  const created = await api
    .post("/api/users")
    .set(bearer("admin"))
    .send({
      username: "newinsured",
      password: "StrongDemoPass1!",
      roles: ["customer"],
      firstName: "New",
      lastName: "Insured",
      email: "new@example.test",
    });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.userType, "customer");
  assert.equal(created.body.user.linkedPoliciesCount, 0);
  for (const field of [
    "dateOfBirth",
    "emergencyContactName",
    "addressLine2",
    "beneficiaryName",
    "country",
  ]) {
    assert.equal(typeof created.body.user[field], "string");
  }
  assert.equal(created.body.user.passwordHash, undefined);
  assert.equal(created.body.user.authVersion, undefined);
  const edit = await api
    .patch(`/api/users/${created.body.user.id}`)
    .set(bearer("admin"))
    .send({
      department: "",
      addressLine1: "123 North Street",
      preferredContact: "phone",
    });
  assert.equal(edit.status, 200);
  assert.equal(edit.body.user.addressLine1, "123 North Street");
});
test("customer cannot retrieve another customer's claim by ID", async () => {
  const created = await api.post("/api/claims").set(bearer("customer")).send({
    policyId: "sample",
    claimType: "damage",
    incidentDate: "2026-05-01",
    claimAmount: 100,
    description: "Valid test claim",
  });
  assert.equal(created.status, 201);
  assert.equal(
    (
      await api
        .get(`/api/claims/${created.body.claim.id}`)
        .set(bearer("customer2"))
    ).status,
    401,
  );
  // The role update earlier revoked customer2's token; authenticate again.
  const fresh = await api
    .post("/api/auth/login")
    .send({ username: "customer2", password: "DemoPass123!" });
  assert.equal(fresh.status, 200);
  assert.equal(
    (
      await api
        .get(`/api/claims/${created.body.claim.id}`)
        .set("Authorization", `Bearer ${fresh.body.token}`)
    ).status,
    403,
  );
});
test("adjuster can mark a submitted claim under review and decide", async () => {
  const created = await api.post("/api/claims").set(bearer("customer")).send({
    policyId: "sample",
    claimType: "weather",
    incidentDate: "2026-04-01",
    claimAmount: 230,
    description: "Windstorm damage",
  });
  assert.equal(created.status, 201);
  const path = `/api/claims/${created.body.claim.id}`;
  const review = await api
    .patch(path + "/status")
    .set(bearer("adjuster"))
    .send({ status: "under_review" });
  assert.equal(review.status, 200);
  assert.equal(review.body.claim.status, "under_review");
  const decided = await api
    .patch(path + "/decision")
    .set(bearer("adjuster"))
    .send({ decision: "rejected", comment: "Missing evidence" });
  assert.equal(decided.status, 200);
  assert.equal(decided.body.claim.decisionComment, "Missing evidence");
  assert.equal(
    (
      await api
        .patch(path + "/decision")
        .set(bearer("adjuster"))
        .send({ decision: "approved" })
    ).status,
    409,
  );
});
test("mixed-role requester cannot approve their own amendment", async () => {
  const account = await api
    .post("/api/users")
    .set(bearer("admin"))
    .send({
      username: "dualauthority",
      password: "StrongDemoPass1!",
      roles: ["customer", "underwriter"],
      firstName: "Dual",
      lastName: "Authority",
      email: "dual@example.test",
    });
  assert.equal(account.status, 201);
  const policy = await api.post("/api/policies").set(bearer("admin")).send({
    customerId: account.body.user.id,
    insuranceType: "life",
    coverageAmount: 90000,
    premiumAmount: 150,
    effectiveDate: "2026-01-01",
    expiryDate: "2027-01-01",
  });
  assert.equal(policy.status, 201);
  const access = await api
    .post("/api/auth/login")
    .send({ username: "dualauthority", password: "StrongDemoPass1!" });
  assert.equal(access.status, 200);
  const header = { Authorization: `Bearer ${access.body.token}` };
  const amendment = await api.post("/api/amendments").set(header).send({
    policyId: policy.body.policy.id,
    requestType: "coverageAmount",
    currentValue: 90000,
    requestedValue: 95000,
    reason: "Increase coverage",
  });
  assert.equal(amendment.status, 201);
  assert.equal(
    (
      await api
        .patch(`/api/amendments/${amendment.body.amendment.id}/decision`)
        .set(header)
        .send({ decision: "approved" })
    ).status,
    403,
  );
});

test("support may edit non-sensitive customer contacts but cannot modify roles", async () => {
  const reactivate = await api
    .patch("/api/users/service/status")
    .set(bearer("admin"))
    .send({ status: "active" });
  assert.equal(reactivate.status, 200);
  const session = await api
    .post("/api/auth/login")
    .send({ username: "service", password: "DemoPass123!" });
  assert.equal(session.status, 200);
  const header = { Authorization: `Bearer ${session.body.token}` };
  const scoped = await api.get("/api/users/customer").set(header);
  assert.equal(scoped.status, 200);
  assert.equal(scoped.body.user.username, "customer");
  assert.equal(scoped.body.user.dateOfBirth, undefined);
  assert.equal(
    (
      await api
        .patch("/api/users/customer/contact")
        .set(header)
        .send({ roles: ["admin"] })
    ).status,
    400,
  );
  const saved = await api
    .patch("/api/users/customer/contact")
    .set(header)
    .send({ phone: "4165551212" });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.user.phone, "4165551212");
  assert.equal(
    (await api.get("/api/rbac/assignments").set(header)).status,
    403,
  );
});

test("customer-service claim list exposes status, not incident details", async () => {
  const session = await api
    .post("/api/auth/login")
    .send({ username: "service", password: "DemoPass123!" });
  assert.equal(session.status, 200);
  const response = await api
    .get("/api/claims")
    .set("Authorization", `Bearer ${session.body.token}`);
  assert.equal(response.status, 200);
  assert.ok(response.body.claims.length > 0);
  for (const claim of response.body.claims) {
    assert.equal(typeof claim.status, "string");
    assert.equal(claim.description, undefined);
    assert.equal(claim.claimAmount, undefined);
  }
});
