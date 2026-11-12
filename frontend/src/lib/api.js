const BASE = process.env.NEXT_PUBLIC_API_URL || "https://localhost:8443/api";
export const api = async (path, { method = "GET", token, body } = {}) => {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const data = await r.json().catch(() => ({ error: "Unexpected response" }));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
};
