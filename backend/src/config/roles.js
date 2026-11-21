export const ROLES = [
  "customer",
  "agent",
  "underwriter",
  "adjuster",
  "service",
  "compliance",
  "admin",
];
export const INTERNAL = ROLES.filter((r) => r !== "customer");
export const userPublic = (u) => {
  const { passwordHash, authVersion, ...safe } = u;
  return safe;
};
