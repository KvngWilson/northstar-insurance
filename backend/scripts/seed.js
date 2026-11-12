import "dotenv/config";
import bcrypt from "bcryptjs";
import { load, save, id, stamp } from "../src/services/db.js";
const db = load();
if (db.users.length) {
  console.log("Data already seeded");
  process.exit(0);
}
const credentials = [
  ["admin", "admin", "Admin", "North"],
  ["customer", "customer", "Avery", "Reed"],
  ["customer2", "customer", "Morgan", "Lee"],
  ["agent", "agent", "Jordan", "Smith"],
  ["underwriter", "underwriter", "Taylor", "Ng"],
  ["adjuster", "adjuster", "Casey", "Bell"],
  ["service", "service", "Robin", "Hart"],
  ["compliance", "compliance", "Riley", "Park"],
];
for (const [username, role, firstName, lastName] of credentials) {
  db.users.push({
    id: id(),
    username,
    passwordHash: bcrypt.hashSync("DemoPass123!", 12),
    roles: [role],
    authVersion: 0,
    status: "active",
    userType: role === "customer" ? "customer" : "staff",
    firstName,
    lastName,
    email: `${username}@example.test`,
    phone: "",
    dateOfBirth: "",
    addressLine1: "",
    addressLine2: "",
    city: "Toronto",
    province: "ON",
    postalCode: "",
    country: "Canada",
    preferredContact: "email",
    emergencyContactName: "",
    emergencyContactPhone: "",
    customerNumber: role === "customer" ? "C-" + username : "",
    employeeNumber: role !== "customer" ? "E-" + username : "",
    clientCategory: "personal",
    department: role === "customer" ? "" : role,
    jobTitle: role,
    supervisorId: "",
    assignedAgentId: "",
    createdAt: stamp(),
    updatedAt: stamp(),
    lastLogin: null,
  });
}
const customer = db.users.find((u) => u.username === "customer");
const agent = db.users.find((u) => u.username === "agent");
customer.assignedAgentId = agent.id;
for (const type of ["life", "car", "home"])
  db.policies.push({
    id: id(),
    policyNumber: "NS-DEMO-" + type.toUpperCase(),
    insuranceType: type,
    customerId: customer.id,
    coverageAmount: 100000,
    premiumAmount: 1100,
    currency: "CAD",
    effectiveDate: "2026-01-01",
    expiryDate: "2027-01-01",
    status: "active",
    createdBy: agent.id,
    createdAt: stamp(),
    updatedAt: stamp(),
    details: "Sample policy — not real insurance coverage",
  });
save(db);
console.log(
  "Demo accounts created: " + credentials.map((x) => x[0]).join(", "),
);
console.log("Demo password: DemoPass123! (change in non-lab environments)");
