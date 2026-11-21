const BASE = process.env.NEXT_PUBLIC_API_URL || "https://localhost:8443/api";
export const api = async (path, { method = "GET", token, body } = {}) => {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const result = await response
    .json()
    .catch(() => ({ error: "Unexpected response" }));
  if (!response.ok) {
    const error = new Error(result.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return result;
};
