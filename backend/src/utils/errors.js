export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const fail = (status, message) => {
  throw new HttpError(status, message);
};
export const safe = (fn) => (req, res, next) =>
  Promise.resolve()
    .then(() => fn(req, res, next))
    .catch(next);
export const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res
    .status(status)
    .json({ error: status >= 500 ? "Internal server error" : err.message });
};
export const requiredString = (v, label, max = 255) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    fail(400, `${label} must be a nonempty string (max ${max})`);
  return v.trim();
};
export const amount = (v, name) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
    fail(400, `${name} must be a nonnegative number`);
  return v;
};
export const oneOf = (v, allowed, name) => {
  if (!allowed.includes(v)) fail(400, `Invalid ${name}`);
  return v;
};
export const isoDate = (v, name) => {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    Number.isNaN(Date.parse(v))
  )
    fail(400, `Invalid ${name}`);
  return v;
};
