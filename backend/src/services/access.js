// Centralized data-scope rules. A role check alone never grants access to a row.
const has = (user, role) => user.roles.includes(role);
export const admin = (user) => has(user, "admin");
export const assignedCustomer = (db, customerId, user) =>
  db.users.some(
    (candidate) =>
      candidate.id === customerId && candidate.assignedAgentId === user.id,
  );
export const policyVisible = (db, policy, user) => {
  if (!policy) return false;
  if (admin(user)) return true;
  if (has(user, "customer") && policy.customerId === user.id) return true;
  if (
    has(user, "agent") &&
    (policy.createdBy === user.id ||
      assignedCustomer(db, policy.customerId, user))
  )
    return true;
  if (
    has(user, "underwriter") &&
    [...db.amendments, ...db.reductions].some((r) => r.policyId === policy.id)
  )
    return true;
  if (has(user, "adjuster") && db.claims.some((c) => c.policyId === policy.id))
    return true;
  if (has(user, "service") || has(user, "compliance")) return true;
  return false;
};
export const resourceVisible = (db, collection, row, user) => {
  if (admin(user)) return true;
  const policy = db.policies.find((p) => p.id === row.policyId);
  if (!policy) return false;
  if (has(user, "customer") && policy.customerId === user.id) return true;
  if (
    has(user, "agent") &&
    (policy.createdBy === user.id ||
      assignedCustomer(db, policy.customerId, user))
  )
    return true;
  if (has(user, "service") || has(user, "compliance")) return true;
  if (collection === "claims") return has(user, "adjuster");
  if (collection === "amendments" || collection === "reductions")
    return has(user, "underwriter");
  return false;
};
export const mayRequestFor = (db, policy, user) =>
  admin(user) ||
  (has(user, "customer") && policy.customerId === user.id) ||
  (has(user, "agent") &&
    (policy.createdBy === user.id ||
      assignedCustomer(db, policy.customerId, user))) ||
  has(user, "service");
