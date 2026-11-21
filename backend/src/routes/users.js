import { Router } from "express";
import bcrypt from "bcryptjs";
import { load, save, id, stamp, audit, get } from "../services/db.js";
import { authenticate, roles } from "../middleware/auth.js";
import { fail, requiredString, oneOf, safe, isoDate } from "../utils/errors.js";
import { ROLES, userPublic } from "../config/roles.js";

export const users = Router();
users.use(authenticate);
export const contactFields = [
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
export const adminFields = [
  "dateOfBirth",
  "department",
  "jobTitle",
  "supervisorId",
  "internalAccessStatus",
  "clientCategory",
  "customerNumber",
  "employeeNumber",
  "assignedAgentId",
  "beneficiaryName",
];
const textFields = new Set([...contactFields, ...adminFields]);
const protectedFields = [
  "id",
  "userId",
  "username",
  "password",
  "passwordHash",
  "roles",
  "status",
  "authVersion",
  "userType",
  "lastLogin",
  "createdAt",
  "updatedAt",
];
const profileDefaults = (type) => ({
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  province: "",
  postalCode: "",
  country: "",
  customerNumber: "",
  employeeNumber: "",
  preferredContact: "email",
  emergencyContactName: "",
  emergencyContactPhone: "",
  department: "",
  jobTitle: "",
  supervisorId: "",
  internalAccessStatus: type === "staff" ? "active" : "not_applicable",
  clientCategory: type === "customer" ? "personal" : "",
  assignedAgentId: "",
  beneficiaryName: "",
});
const project = (db, user) => ({
  ...userPublic(user),
  linkedPoliciesCount: db.policies.filter((p) => p.customerId === user.id)
    .length,
});
const complianceProjection = (user) => ({
  id: user.id,
  username: user.username,
  roles: user.roles,
  status: user.status,
  firstName: user.firstName,
  lastName: user.lastName,
});
const serviceProjection = (user) => ({
  id: user.id,
  username: user.username,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone,
  addressLine1: user.addressLine1,
  addressLine2: user.addressLine2,
  city: user.city,
  province: user.province,
  postalCode: user.postalCode,
  country: user.country,
  preferredContact: user.preferredContact,
  status: user.status,
  userType: user.userType,
});
const isCustomerRecord = (user) =>
  user != null &&
  Array.isArray(user.roles) &&
  user.roles.length === 1 &&
  user.roles[0] === "customer" &&
  (user.userType == null || user.userType === "customer");
const supportVisible = (db, customer, actor) => {
  if (!isCustomerRecord(customer)) return false;
  if (actor.roles.includes("service")) return true;
  if (actor.roles.includes("agent"))
    return (
      customer.assignedAgentId === actor.id ||
      db.policies.some(
        (p) => p.customerId === customer.id && p.createdBy === actor.id,
      )
    );
  return false;
};
const supportFields = [
  "email",
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "province",
  "postalCode",
  "country",
  "preferredContact",
];
const updateFields = (db, user, data, privileged = false) => {
  if (!data || typeof data !== "object" || Array.isArray(data))
    fail(400, "Invalid profile payload");
  for (const key of protectedFields)
    if (Object.hasOwn(data, key)) fail(400, `Cannot edit ${key} here`);
  const allowed = privileged
    ? [...contactFields, ...adminFields]
    : contactFields;
  for (const key of Object.keys(data))
    if (!allowed.includes(key)) fail(400, `Field ${key} is not editable`);
  for (const key of allowed) {
    if (!Object.hasOwn(data, key)) continue;
    const value = data[key];
    if (!textFields.has(key) || typeof value !== "string" || value.length > 200)
      fail(400, `Invalid ${key}`);
    const trimmed = value.trim();
    if (
      key === "email" &&
      trimmed &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
    )
      fail(400, "Invalid email");
    if (key === "dateOfBirth" && trimmed) isoDate(trimmed, "dateOfBirth");
    if (key === "preferredContact")
      oneOf(trimmed, ["email", "phone", "mail"], key);
    if (key === "internalAccessStatus")
      oneOf(trimmed, ["active", "suspended", "not_applicable"], key);
    if (key === "assignedAgentId" && trimmed) {
      const agent = get(db, "users", trimmed);
      if (!agent || !agent.roles.includes("agent"))
        fail(400, "Assigned agent not found");
    }
    user[key] = trimmed;
  }
  user.updatedAt = stamp();
};
users.get("/me", (req, res) => {
  const db = load(),
    user = get(db, "users", req.user.id);
  res.json({ user: project(db, user) });
});
users.patch(
  "/me",
  safe((req, res) => {
    const db = load(),
      user = get(db, "users", req.user.id);
    updateFields(db, user, req.body || {});
    audit(db, req.user.id, "user.self_update", user.id);
    save(db);
    res.json({ user: project(db, user) });
  }),
);
users.get("/", roles("admin", "compliance", "agent", "service"), (req, res) => {
  const db = load();
  let result;
  if (req.user.roles.includes("admin"))
    result = db.users.map((u) => project(db, u));
  else if (req.user.roles.includes("compliance"))
    result = db.users.map(complianceProjection);
  else
    result = db.users
      .filter((u) => supportVisible(db, u, req.user))
      .map(serviceProjection);
  res.json({ users: result });
});
users.post(
  "/",
  roles("admin"),
  safe((req, res) => {
    const data = req.body || {};
    const username = requiredString(data.username, "username", 100);
    const password = requiredString(data.password, "password", 255);
    if (password.length < 10)
      fail(400, "Password must have at least 10 characters");
    const db = load();
    if (
      db.users.some(
        (user) => user.username.toLowerCase() === username.toLowerCase(),
      )
    )
      fail(409, "Username exists");
    const assignedRoles = Array.isArray(data.roles) ? data.roles : ["customer"];
    if (
      !assignedRoles.length ||
      assignedRoles.some((role) => !ROLES.includes(role))
    )
      fail(400, "Invalid roles");
    const userType = assignedRoles.includes("customer") ? "customer" : "staff";
    const user = {
      id: id(),
      username,
      passwordHash: bcrypt.hashSync(password, 12),
      roles: [...new Set(assignedRoles)],
      authVersion: 0,
      status: "active",
      userType,
      ...profileDefaults(userType),
      createdAt: stamp(),
      updatedAt: stamp(),
      lastLogin: null,
    };
    if (userType === "customer")
      user.customerNumber = `C-${user.id.slice(0, 8).toUpperCase()}`;
    else user.employeeNumber = `E-${user.id.slice(0, 8).toUpperCase()}`;
    const {
      username: _username,
      password: _password,
      roles: _roles,
      ...profileData
    } = data;
    updateFields(db, user, profileData, true);
    user.firstName = requiredString(user.firstName, "firstName", 200);
    user.lastName = requiredString(user.lastName, "lastName", 200);
    user.email = requiredString(user.email, "email", 200);
    db.users.push(user);
    audit(db, req.user.id, "user.create", user.id);
    save(db);
    res.status(201).json({ user: project(db, user) });
  }),
);
users.get(
  "/:id",
  roles("admin", "compliance", "agent", "service"),
  safe((req, res) => {
    const db = load(),
      user = get(db, "users", req.params.id);
    if (!user) fail(404, "User not found");
    if (req.user.roles.includes("admin"))
      return res.json({ user: project(db, user) });
    if (req.user.roles.includes("compliance"))
      return res.json({ user: complianceProjection(user) });
    if (!supportVisible(db, user, req.user))
      fail(403, "Profile outside business scope");
    res.json({ user: serviceProjection(user) });
  }),
);
users.patch(
  "/:id/contact",
  roles("service", "admin"),
  safe((req, res) => {
    const db = load(),
      user = get(db, "users", req.params.id);
    if (!user) fail(404, "User not found");
    if (!isCustomerRecord(user))
      fail(403, "Only customer contact details may be updated here");
    if (
      !req.user.roles.includes("admin") &&
      !supportVisible(db, user, req.user)
    )
      fail(403, "Profile outside business scope");
    if (
      !req.body ||
      typeof req.body !== "object" ||
      Array.isArray(req.body) ||
      Object.keys(req.body).some((field) => !supportFields.includes(field))
    )
      fail(400, "Only non-sensitive contact fields may be updated");
    updateFields(db, user, req.body);
    audit(db, req.user.id, "user.support_update", user.id);
    save(db);
    res.json({ user: serviceProjection(user) });
  }),
);
users.patch(
  "/:id",
  roles("admin"),
  safe((req, res) => {
    const db = load(),
      user = get(db, "users", req.params.id);
    if (!user) fail(404, "User not found");
    updateFields(db, user, req.body || {}, true);
    audit(db, req.user.id, "user.update", user.id);
    save(db);
    res.json({ user: project(db, user) });
  }),
);
users.patch(
  "/:id/status",
  roles("admin"),
  safe((req, res) => {
    const db = load(),
      user = get(db, "users", req.params.id);
    if (!user) fail(404, "User not found");
    const status = oneOf(req.body?.status, ["active", "disabled"], "status");
    if (req.user.id === user.id && status === "disabled")
      fail(400, "Cannot disable your own account");
    if (
      status === "disabled" &&
      user.roles.includes("admin") &&
      !db.users.some(
        (other) =>
          other.id !== user.id &&
          other.status === "active" &&
          other.roles.includes("admin"),
      )
    )
      fail(409, "Cannot disable the last active administrator");
    if (status !== user.status) {
      user.status = status;
      user.authVersion++;
      user.updatedAt = stamp();
      audit(db, req.user.id, "user.status", `${user.id}:${status}`);
      save(db);
    }
    res.json({ user: project(db, user) });
  }),
);
