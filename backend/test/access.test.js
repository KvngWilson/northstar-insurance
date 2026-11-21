import { test } from "node:test";
import assert from "node:assert/strict";
import {
  policyVisible,
  resourceVisible,
  mayRequestFor,
} from "../src/services/access.js";
const user = (id, role) => ({ id, roles: [role] });
const customer = user("c1", "customer");
const other = user("c2", "customer");
const agent = user("a1", "agent");
const underwriter = user("u1", "underwriter");
const adjuster = user("j1", "adjuster");
const service = user("s1", "service");
const admin = user("admin", "admin");
const pa = { id: "p1", customerId: "c1", createdBy: "a1" };
const pb = { id: "p2", customerId: "c2", createdBy: "a2" };
const db = {
  policies: [pa, pb],
  users: [
    { id: "c1", assignedAgentId: "a1" },
    { id: "c2", assignedAgentId: "a2" },
  ],
  claims: [{ id: "cl1", policyId: "p1", status: "submitted" }],
  amendments: [{ id: "am2", policyId: "p2", status: "pending" }],
  reductions: [],
};
test("customer may only read and request on owned policy", () => {
  assert.equal(policyVisible(db, pa, customer), true);
  assert.equal(policyVisible(db, pb, customer), false);
  assert.equal(resourceVisible(db, "claims", db.claims[0], other), false);
  assert.equal(mayRequestFor(db, pb, customer), false);
});
test("agent access is limited to created and assigned policies", () => {
  assert.equal(policyVisible(db, pa, agent), true);
  assert.equal(policyVisible(db, pb, agent), false);
  assert.equal(mayRequestFor(db, pb, agent), false);
});
test("underwriter sees only policies with underwriting activity", () => {
  assert.equal(policyVisible(db, pa, underwriter), false);
  assert.equal(policyVisible(db, pb, underwriter), true);
  assert.equal(resourceVisible(db, "claims", db.claims[0], underwriter), false);
});
test("adjuster policy access requires a related claim", () => {
  assert.equal(policyVisible(db, pa, adjuster), true);
  assert.equal(policyVisible(db, pb, adjuster), false);
  assert.equal(
    resourceVisible(db, "amendments", db.amendments[0], adjuster),
    false,
  );
});
test("service support can register requests but not approve in role middleware", () => {
  assert.equal(mayRequestFor(db, pa, service), true);
});
test("administrator has global data scope", () => {
  assert.equal(policyVisible(db, pa, admin), true);
  assert.equal(policyVisible(db, pb, admin), true);
  assert.equal(mayRequestFor(db, pb, admin), true);
});
test("empty policy lookup is not visible", () => {
  assert.equal(policyVisible(db, undefined, admin), false);
});
