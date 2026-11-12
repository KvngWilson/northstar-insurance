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
  const r = await api
    .post("/api/policies")
    .set(bearer("agent"))
    .send({
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
  const r = await api
    .post("/api/claims")
    .set(bearer("customer"))
    .send({
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
