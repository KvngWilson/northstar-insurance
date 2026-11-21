"use client";
import { useState } from "react";
import { api } from "../lib/api";
const fields = {
  profile: [
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
  ],
  supportProfile: [
    "email",
    "phone",
    "addressLine1",
    "addressLine2",
    "city",
    "province",
    "postalCode",
    "country",
    "preferredContact",
  ],
  adminProfile: [
    "firstName",
    "lastName",
    "dateOfBirth",
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
    "customerNumber",
    "employeeNumber",
    "department",
    "jobTitle",
    "supervisorId",
    "internalAccessStatus",
    "clientCategory",
    "assignedAgentId",
    "beneficiaryName",
  ],
  policy: [
    "customerId",
    "insuranceType",
    "coverageAmount",
    "premiumAmount",
    "effectiveDate",
    "expiryDate",
  ],
  amendment: [
    "policyId",
    "requestType",
    "currentValue",
    "requestedValue",
    "reason",
  ],
  reduction: ["policyId", "currentCoverage", "requestedCoverage", "reason"],
  claim: [
    "policyId",
    "claimType",
    "incidentDate",
    "claimAmount",
    "description",
  ],
};
const numeric = new Set([
  "coverageAmount",
  "premiumAmount",
  "currentValue",
  "requestedValue",
  "currentCoverage",
  "requestedCoverage",
  "claimAmount",
]);
const formPayload = (form) =>
  Object.fromEntries(
    Object.entries(form).map(([k, v]) => [k, numeric.has(k) ? Number(v) : v]),
  );
const has = (u, ...roles) => roles.some((r) => u?.roles?.includes(r));
function Form({
  title,
  keys,
  onSubmit,
  initial = {},
  button = "Submit",
  policies = [],
}) {
  const [form, setForm] = useState(() =>
    Object.fromEntries(
      keys
        .filter((key) => initial[key] !== undefined)
        .map((key) => [key, initial[key]]),
    ),
  );
  // Only editable fields are sent; authentication/role metadata is never included.
  // Form instances remount after server refresh via the parent's updatedAt key.
  const required = new Set([
    "username",
    "password",
    "firstName",
    "lastName",
    "email",
    "customerId",
    "insuranceType",
    "coverageAmount",
    "premiumAmount",
    "effectiveDate",
    "expiryDate",
    "policyId",
    "requestType",
    "currentValue",
    "requestedValue",
    "currentCoverage",
    "requestedCoverage",
    "reason",
    "claimType",
    "incidentDate",
    "claimAmount",
    "description",
  ]);
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(formPayload(form));
      }}
    >
      <h3>{title}</h3>
      <div className="formgrid">
        {keys.map((k) => (
          <label key={k}>
            <span>{k.replace(/([A-Z])/g, " $1")}</span>
            {k === "policyId" && policies.length ? (
              <select
                required
                value={form[k] ?? ""}
                onChange={(e) => {
                  const found = policies.find((p) => p.id === e.target.value);
                  setForm({
                    ...form,
                    policyId: e.target.value,
                    ...(found && keys.includes("currentValue")
                      ? { currentValue: found.coverageAmount }
                      : {}),
                    ...(found && keys.includes("currentCoverage")
                      ? { currentCoverage: found.coverageAmount }
                      : {}),
                  });
                }}
              >
                <option value="">Select a policy</option>
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.policyNumber} ({p.insuranceType})
                  </option>
                ))}
              </select>
            ) : k === "insuranceType" ? (
              <select
                required
                value={form[k] ?? ""}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              >
                <option value="">Select an insurance type</option>
                {["life", "car", "home"].map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            ) : k === "preferredContact" ? (
              <select
                value={form[k] ?? "email"}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              >
                {["email", "phone", "mail"].map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            ) : k === "internalAccessStatus" ? (
              <select
                value={form[k] ?? "not_applicable"}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              >
                {["active", "suspended", "not_applicable"].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            ) : (
              <input
                required={
                  required.has(k) &&
                  !title.startsWith("Update ") &&
                  !title.startsWith("Edit ")
                }
                type={
                  k === "password"
                    ? "password"
                    : k === "email"
                      ? "email"
                      : k.toLowerCase().includes("date")
                        ? "date"
                        : numeric.has(k)
                          ? "number"
                          : "text"
                }
                step={numeric.has(k) ? "any" : undefined}
                value={form[k] ?? ""}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            )}
          </label>
        ))}
      </div>
      <button type="submit">{button}</button>
    </form>
  );
}
export default function Home() {
  const [token, setToken] = useState(""),
    [user, setUser] = useState(null),
    [login, setLogin] = useState({ username: "customer", password: "" }),
    [tab, setTab] = useState("dashboard"),
    [data, setData] = useState({}),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [newUserRole, setNewUserRole] = useState("customer"),
    [selectedUserId, setSelectedUserId] = useState(""),
    [selectedProfile, setSelectedProfile] = useState(null);
  const fetchAll = async (t, u) => {
    const requests = [
      ["profile", "/users/me"],
      ["policies", "/policies"],
    ];
    if (
      has(
        u,
        "customer",
        "agent",
        "underwriter",
        "service",
        "compliance",
        "admin",
      )
    ) {
      requests.push(
        ["amendments", "/amendments"],
        ["reductions", "/reductions"],
      );
    }
    if (
      has(u, "customer", "agent", "adjuster", "service", "compliance", "admin")
    )
      requests.push(["claims", "/claims"]);
    if (has(u, "admin", "compliance", "agent", "service"))
      requests.push(["users", "/users"]);
    if (has(u, "admin", "compliance")) requests.push(["audits", "/audits"]);
    if (has(u, "admin")) requests.push(["roles", "/rbac/roles"]);
    const entries = await Promise.all(
      requests.map(async ([key, path]) => {
        try {
          return [key, await api(path, { token: t })];
        } catch (e) {
          return [key, { error: e.message }];
        }
      }),
    );
    setData(Object.fromEntries(entries));
  };
  const signIn = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api("/auth/login", { method: "POST", body: login });
      setToken(result.token);
      setUser(result.user);
      setTab("dashboard");
      setMessage("");
      await fetchAll(result.token, result.user);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  const action = async (path, method, body) => {
    setBusy(true);
    try {
      const result = await api(path, { method, body, token });
      setMessage("Saved successfully");
      if (result?.user?.id === selectedUserId) setSelectedProfile(result.user);
      if (result?.user?.id === user?.id) setUser(result.user);
      await fetchAll(token, user);
      return result;
    } catch (e) {
      if (e.status === 401) {
        setToken("");
        setUser(null);
        setData({});
        setMessage(
          "Your session expired or access changed. Please sign in again.",
        );
      } else setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  const openProfile = async (id) => {
    setSelectedUserId(id);
    setSelectedProfile(null);
    if (!id) return;
    try {
      setSelectedProfile((await api(`/users/${id}`, { token })).user);
    } catch (e) {
      setMessage(e.message);
    }
  };
  const logout = () => {
    setToken("");
    setUser(null);
    setData({});
    setMessage("");
    setSelectedUserId("");
    setSelectedProfile(null);
    setLogin({ ...login, password: "" });
  };
  const policies = data.policies?.policies || [],
    amendments = data.amendments?.amendments || [],
    reductions = data.reductions?.reductions || [],
    claims = data.claims?.claims || [],
    users = data.users?.users || [],
    audits = data.audits?.audits || [];
  const portal = has(user, "admin")
    ? "Administration"
    : has(user, "customer")
      ? "Customer Portal"
      : "Operations Portal";
  const nav = [
    "dashboard",
    "profile",
    "policies",
    ...(has(
      user,
      "customer",
      "agent",
      "underwriter",
      "service",
      "compliance",
      "admin",
    )
      ? ["amendments", "reductions"]
      : []),
    ...(has(
      user,
      "customer",
      "agent",
      "adjuster",
      "service",
      "compliance",
      "admin",
    )
      ? ["claims"]
      : []),
    ...(has(user, "admin", "compliance", "agent", "service") ? ["users"] : []),
    ...(has(user, "admin", "compliance") ? ["audits"] : []),
    ...(has(user, "admin") ? ["rbac"] : []),
  ];
  return (
    <div className="shell">
      <header>
        <div className="brand">
          <div className="logo">N</div>
          <div>
            <strong>NorthStar</strong>
            <small>INSURANCE & FINANCIAL SERVICES</small>
          </div>
        </div>
        <span className="secure">● HTTPS API · JWT Protected</span>
      </header>
      {!user ? (
        <main className="login">
          <div className="hero">
            <span className="eyebrow">SECURE INSURANCE PLATFORM</span>
            <h1>Coverage and confidence, in one place.</h1>
            <p>
              Manage life, car, and home insurance through role-aware customer
              and employee experiences.
            </p>
            <div className="chips">
              <span>Life</span>
              <span>Car</span>
              <span>Home</span>
            </div>
          </div>
          <form className="loginbox" onSubmit={signIn}>
            <h2>Welcome back</h2>
            <p>Sign in with your demo account to explore the application.</p>
            <label>
              Username
              <input
                autoComplete="username"
                value={login.username}
                onChange={(e) =>
                  setLogin({ ...login, username: e.target.value })
                }
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={login.password}
                onChange={(e) =>
                  setLogin({ ...login, password: e.target.value })
                }
              />
            </label>
            <button disabled={busy}>Secure sign in</button>
            {message && (
              <p className="error" role="alert">
                {message}
              </p>
            )}
            <small>
              Demo password: DemoPass123! · Users: customer, customer2, agent,
              underwriter, adjuster, service, compliance, admin
            </small>
          </form>
        </main>
      ) : (
        <div className="workspace">
          <aside>
            <h2>{portal}</h2>
            <p>
              {user.firstName} {user.lastName}
              <br />
              <span>{user.roles.join(" · ")}</span>
            </p>
            <nav>
              {nav.map((item) => (
                <button
                  className={tab === item ? "selected" : ""}
                  key={item}
                  onClick={() => {
                    setTab(item);
                    setMessage("");
                  }}
                >
                  {item[0].toUpperCase() + item.slice(1)}
                </button>
              ))}
            </nav>
            <button className="logout" onClick={logout}>
              Sign out
            </button>
          </aside>
          <main className="main">
            <div className="topline">
              <div>
                <span className="eyebrow">
                  NORTHSTAR / {portal.toUpperCase()}
                </span>
                <h1>{tab[0].toUpperCase() + tab.slice(1)}</h1>
              </div>
              <button
                className="secondary"
                onClick={() => fetchAll(token, user)}
              >
                Refresh
              </button>
            </div>
            {message && (
              <p className="notice" role="status">
                {message}
              </p>
            )}
            {tab === "dashboard" && (
              <>
                <div className="cards">
                  <div>
                    <span>My visible policies</span>
                    <strong>{policies.length}</strong>
                  </div>
                  <div>
                    <span>Amendment requests</span>
                    <strong>{amendments.length}</strong>
                  </div>
                  <div>
                    <span>Claims</span>
                    <strong>{claims.length}</strong>
                  </div>
                </div>
                <section className="panel">
                  <h3>What you can do</h3>
                  <p>
                    Open a navigation section to manage the records permitted
                    for your role. All business authorization is enforced by the
                    Express API—not just these interface controls.
                  </p>
                  <p className="muted">
                    Session is held in memory and is cleared when this tab is
                    refreshed or closed. Reauthenticate to continue.
                  </p>
                </section>
              </>
            )}
            {tab === "profile" && (
              <>
                <section className="panel">
                  <h3>Account details</h3>
                  <p>
                    <b>Username:</b> {user.username} · <b>Account:</b>{" "}
                    {user.status} · <b>Roles:</b> {user.roles.join(", ")}
                  </p>
                </section>
                {data.profile?.user && (
                  <section className="panel">
                    <h3>Full user profile (read only)</h3>
                    <dl className="profilegrid">
                      {[
                        "userId",
                        "firstName",
                        "lastName",
                        "userType",
                        "dateOfBirth",
                        "email",
                        "phone",
                        "addressLine1",
                        "addressLine2",
                        "city",
                        "province",
                        "postalCode",
                        "country",
                        "customerNumber",
                        "employeeNumber",
                        "preferredContact",
                        "emergencyContactName",
                        "emergencyContactPhone",
                        "department",
                        "jobTitle",
                        "supervisorId",
                        "internalAccessStatus",
                        "clientCategory",
                        "beneficiaryName",
                        "linkedPoliciesCount",
                        "createdAt",
                        "updatedAt",
                      ].map((field) => (
                        <div key={field}>
                          <dt>{field.replace(/([A-Z])/g, " $1")}</dt>
                          <dd>{String(data.profile.user[field] ?? "—")}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}
                <Form
                  key={`${user.id}:${data.profile?.user?.updatedAt || ""}`}
                  title="Update your contact information"
                  keys={fields.profile}
                  initial={data.profile?.user || {}}
                  onSubmit={(x) => action("/users/me", "PATCH", x)}
                />
              </>
            )}
            {tab === "policies" && (
              <>
                <Collection
                  name="Policies"
                  items={policies}
                  columns={[
                    "policyNumber",
                    "insuranceType",
                    "coverageAmount",
                    "premiumAmount",
                    "status",
                    "id",
                  ]}
                />
                {has(user, "agent", "admin") && (
                  <Form
                    title="Create policy"
                    keys={fields.policy}
                    onSubmit={(x) => action("/policies", "POST", x)}
                  />
                )}
              </>
            )}
            {tab === "amendments" && (
              <>
                <Collection
                  name="Amendment requests"
                  items={amendments}
                  columns={["policyId", "requestedValue", "status", "id"]}
                />
                {has(user, "customer", "agent", "service", "admin") && (
                  <Form
                    title="Request policy amendment"
                    keys={fields.amendment}
                    initial={{ requestType: "coverageAmount" }}
                    policies={policies}
                    onSubmit={(x) => action("/amendments", "POST", x)}
                  />
                )}
                {has(user, "underwriter", "admin") && (
                  <Decision
                    items={amendments}
                    onDecision={(id, decision, comment) =>
                      action(`/amendments/${id}/decision`, "PATCH", {
                        decision,
                        comment,
                      })
                    }
                  />
                )}
              </>
            )}
            {tab === "reductions" && (
              <>
                <Collection
                  name="Coverage reductions"
                  items={reductions}
                  columns={["policyId", "requestedCoverage", "status", "id"]}
                />
                {has(user, "customer", "agent", "service", "admin") && (
                  <Form
                    title="Request coverage reduction"
                    keys={fields.reduction}
                    policies={policies}
                    onSubmit={(x) => action("/reductions", "POST", x)}
                  />
                )}
                {has(user, "underwriter", "admin") && (
                  <Decision
                    items={reductions}
                    onDecision={(id, decision, comment) =>
                      action(`/reductions/${id}/decision`, "PATCH", {
                        decision,
                        comment,
                      })
                    }
                  />
                )}
              </>
            )}
            {tab === "claims" && (
              <>
                <Collection
                  name="Claims"
                  items={claims}
                  columns={[
                    "policyId",
                    "claimType",
                    "claimAmount",
                    "status",
                    "id",
                  ]}
                />
                {has(user, "customer", "service", "admin") && (
                  <Form
                    title="Submit insurance claim"
                    keys={fields.claim}
                    policies={policies}
                    onSubmit={(x) => action("/claims", "POST", x)}
                  />
                )}
                {has(user, "adjuster", "admin") && (
                  <Decision
                    isClaim
                    onStartReview={(id) =>
                      action(`/claims/${id}/status`, "PATCH", {
                        status: "under_review",
                      })
                    }
                    items={claims.filter((c) =>
                      ["submitted", "under_review"].includes(c.status),
                    )}
                    onDecision={(id, decision, comment) =>
                      action(`/claims/${id}/decision`, "PATCH", {
                        decision,
                        comment,
                      })
                    }
                  />
                )}
              </>
            )}
            {tab === "users" && (
              <>
                <Collection
                  name="User directory"
                  items={users}
                  columns={[
                    "username",
                    "firstName",
                    "lastName",
                    "roles",
                    "status",
                    "id",
                  ]}
                />
                {has(user, "admin") && (
                  <>
                    <section className="panel">
                      <h3>Create customer or staff account</h3>
                      <label>
                        Initial role
                        <select
                          value={newUserRole}
                          onChange={(e) => setNewUserRole(e.target.value)}
                        >
                          {(data.roles?.roles || ["customer"]).map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Form
                        title="Create user"
                        keys={[
                          "username",
                          "password",
                          "firstName",
                          "lastName",
                          "email",
                        ]}
                        onSubmit={(x) =>
                          action("/users", "POST", {
                            ...x,
                            roles: [newUserRole],
                          })
                        }
                      />
                    </section>
                    <section className="panel">
                      <h3>View and edit user profile</h3>
                      <label>
                        Select user
                        <select
                          value={selectedUserId}
                          onChange={(e) => openProfile(e.target.value)}
                        >
                          <option value="">Choose a user</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.username} — {u.firstName} {u.lastName}
                            </option>
                          ))}
                        </select>
                      </label>
                      {selectedProfile && (
                        <>
                          <p>
                            <b>Account:</b> {selectedProfile.status} ·{" "}
                            <b>Roles:</b> {selectedProfile.roles.join(", ")} ·{" "}
                            <b>Linked policies:</b>{" "}
                            {selectedProfile.linkedPoliciesCount}
                          </p>
                          <Form
                            key={`${selectedProfile.id}:${selectedProfile.updatedAt}`}
                            title="Edit user profile"
                            keys={fields.adminProfile}
                            initial={selectedProfile}
                            onSubmit={(x) =>
                              action(`/users/${selectedProfile.id}`, "PATCH", x)
                            }
                          />
                        </>
                      )}
                    </section>
                    <StatusUsers
                      users={users}
                      onChange={(id, status) =>
                        action(`/users/${id}/status`, "PATCH", { status })
                      }
                    />
                  </>
                )}
              </>
            )}
            {tab === "users" &&
              has(user, "compliance", "agent", "service") &&
              !has(user, "admin") && (
                <section className="panel">
                  <h3>
                    {has(user, "service", "agent")
                      ? "Customer support directory"
                      : "Read-only user profile view"}
                  </h3>
                  <select
                    value={selectedUserId}
                    onChange={(e) => openProfile(e.target.value)}
                  >
                    <option value="">Choose a user</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.username}
                      </option>
                    ))}
                  </select>
                  {selectedProfile && (
                    <>
                      <p>
                        {selectedProfile.username}: {selectedProfile.firstName}{" "}
                        {selectedProfile.lastName} — {selectedProfile.status}
                        {selectedProfile.roles &&
                          ` (${selectedProfile.roles.join(", ")})`}
                      </p>
                      {has(user, "service") && (
                        <Form
                          key={`${selectedProfile.id}:${selectedProfile.updatedAt || ""}`}
                          title="Update customer contact details"
                          keys={fields.supportProfile}
                          initial={selectedProfile}
                          onSubmit={(x) =>
                            action(
                              `/users/${selectedProfile.id}/contact`,
                              "PATCH",
                              x,
                            )
                          }
                        />
                      )}
                    </>
                  )}
                </section>
              )}
            {tab === "audits" && has(user, "admin", "compliance") && (
              <Collection
                name="Recent access and transaction audit events"
                items={audits}
                columns={["at", "by", "action", "target"]}
              />
            )}
            {tab === "rbac" && has(user, "admin") && (
              <RoleEditor
                users={users}
                roles={data.roles?.roles || []}
                onAssign={(id, role) =>
                  action(`/rbac/users/${id}/roles`, "POST", { role })
                }
                onRemove={(id, role) =>
                  action(`/rbac/users/${id}/roles/${role}`, "DELETE")
                }
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}
function Collection({ name, items, columns }) {
  return (
    <section className="panel">
      <h3>
        {name} <span className="count">{items.length}</span>
      </h3>
      {items.length ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                {columns.map((k) => (
                  <th key={k}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  {columns.map((k) => (
                    <td key={k}>
                      {Array.isArray(item[k])
                        ? item[k].join(", ")
                        : String(item[k] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No records found for your access scope.</p>
      )}
    </section>
  );
}
function Decision({ items, onDecision, isClaim = false, onStartReview }) {
  const [comments, setComments] = useState({});
  return (
    <section className="panel">
      <h3>Review pending requests</h3>
      {items
        .filter((i) => ["pending", "submitted"].includes(i.status))
        .map((i) => (
          <div className="decision" key={i.id}>
            <div>
              <b>{i.id}</b>
              <small>Policy: {i.policyId}</small>
            </div>
            <input
              aria-label={"Decision note for " + i.id}
              placeholder="Decision note"
              value={comments[i.id] || ""}
              onChange={(e) =>
                setComments({ ...comments, [i.id]: e.target.value })
              }
            />
            {isClaim && i.status === "submitted" && (
              <button className="secondary" onClick={() => onStartReview(i.id)}>
                Start review
              </button>
            )}
            <button
              onClick={() => onDecision(i.id, "approved", comments[i.id] || "")}
            >
              Approve
            </button>
            <button
              className="danger"
              onClick={() => onDecision(i.id, "rejected", comments[i.id] || "")}
            >
              Reject
            </button>
          </div>
        ))}
    </section>
  );
}
function StatusUsers({ users, onChange }) {
  return (
    <section className="panel">
      <h3>Account administration</h3>
      {users.map((u) => (
        <div className="decision" key={u.id}>
          <span>
            {u.username} — {u.status}
          </span>
          <button
            className="secondary"
            onClick={() =>
              onChange(u.id, u.status === "active" ? "disabled" : "active")
            }
          >
            {u.status === "active" ? "Disable" : "Reactivate"}
          </button>
        </div>
      ))}
    </section>
  );
}
function RoleEditor({ users, roles, onAssign, onRemove }) {
  const [id, setId] = useState(""),
    [role, setRole] = useState("customer");
  return (
    <section className="panel">
      <h3>Role-based access management</h3>
      <p>
        Only administrators can alter role assignments. Changes revoke existing
        access tokens.
      </p>
      <div className="decision">
        <select value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Select user</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.username}
            </option>
          ))}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {roles.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <button disabled={!id} onClick={() => onAssign(id, role)}>
          Assign
        </button>
        <button
          className="danger"
          disabled={!id}
          onClick={() => onRemove(id, role)}
        >
          Remove
        </button>
      </div>
      <Collection
        name="Current role assignments"
        items={users}
        columns={["username", "roles", "status"]}
      />
    </section>
  );
}
