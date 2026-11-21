# NorthStar Insurance & Financial Services — Secure Full-Stack Lab

**Educational prototype** providing a customer portal, internal operations portal and centralized administration portal. The backend uses Node.js, Express, HTTPS, JWT and server-enforced role + record-scope authorization. The Next.js / React frontend is also served over **HTTPS** in local development and Docker Compose. JSON-file persistence keeps the lab reproducible;

## Prerequisites

- Node.js **22** or newer and npm
- OpenSSL, available on the command line (Git Bash is recommended on Windows)
- For Docker mode: Docker Engine / Docker Desktop with Compose v2

## Run locally (two terminals)

**Terminal 1 — HTTPS backend:**

```bash
cd backend
npm install
cp .env.example .env
# Replace JWT_SECRET in .env with a unique random value of at least 32 characters.
bash scripts/cert.sh
npm run seed
npm run dev
```

**Terminal 2 — HTTPS frontend:**

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env` and `Copy-Item .env.local.example .env.local` in the respective directories. Run the OpenSSL script in Git Bash. The frontend default TLS paths point to `../backend/certs/localhost-key.pem` and `../backend/certs/localhost.pem`, which must exist before starting the frontend.

Open **https://localhost:3000** for the portal and **https://localhost:8443/api/health** for the API. Both use the **same local self-signed development certificate**. Trust it only on the lab machine, after verifying it is the certificate you generated. Do **not** bypass TLS verification in the application or use these certificates for a public deployment.

### Environment files

- `backend/.env.example`: `PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_ORIGIN=https://localhost:3000`, `TLS_KEY`, `TLS_CERT`, `DATA_FILE`
- `frontend/.env.local.example`: `NEXT_PUBLIC_API_URL=https://localhost:8443/api`
- `.env.docker.example`: root `JWT_SECRET` for Docker Compose 

## Docker Compose

```bash
cp .env.docker.example .env
# Replace JWT_SECRET with a strong random value.
docker compose up --build -d
docker compose ps
docker compose logs -f backend frontend
```

The backend generates the localhost certificate on the first start, seeds empty storage and reports healthy. The frontend waits for backend health and mounts the **same certificate** read-only. Open **https://localhost:3000**; both browser traffic and API requests run over HTTPS. The `northstar_data` and `northstar_certs` volumes persist across restarts. **`docker compose down -v` deletes demo data and certificates.**

## Demo identities

All eight demo users have the local-only password **`DemoPass123!`**: `admin`, `customer`, `customer2`, `agent`, `underwriter`, `adjuster`, `service`, `compliance`. The account names map to the seven implemented roles: customer, agent, underwriter, adjuster, service, compliance and admin. `npm run seed` initializes only an empty store. Existing data is not overwritten.

## Architecture

```text
Browser — HTTPS :3000 (Next.js custom TLS server)
    | Bearer JWT over HTTPS + CORS allowlist
    v
Node HTTPS :8443 → Express routers → JWT authentication → role checks
    |                                  |                |
    |                                  +→ scope checks → business objects
    +→ validation / errors → JSON store + audit event log
```

- `backend/src/server.js`: Node HTTPS server and mandatory strong JWT secret.
- `backend/src/middleware/auth.js`: strict bearer header parsing, HS256 JWT signature/expiry validation, active account lookup, role checks and token-version revocation.
- `backend/src/services/access.js`: customer ownership, assigned-agent visibility, relevant-underwriter/adjuster visibility and read-only support/compliance scope.
- `backend/src/routes/users.js`: comprehensive user identity and profile, customer self-edits, scoped support access, admin management and account enable/disable.
- `backend/src/routes/rbac.js`: **admin-only** role directory, assignments and removal. Each role/status change revokes affected previous tokens.
- `backend/src/routes/business.js`: life/car/home policy creation, amendment/reduction review and claim filing/review/decision with audit events.
- `backend/src/routes/audits.js`: read-only recent event log for administrator and compliance officer.
- `frontend/src/app/page.js`: login, separate role-dependent navigation and forms, underwriter/adjuster decisions, contact support, admin profile editing and RBAC.
- `frontend/src/lib/api.js`: central HTTPS fetch client with bearer token and HTTP error handling. JWT is held **in memory**, not localStorage. A page reload requires sign-in again.

### Authentication and authorization

`POST /api/auth/login` validates a hashed password (bcrypt) and returns a **signed, expiring** JWT with `sub`, `userId`, `username`, `roles`, `ver`, `iat` and `exp` claims. A token contains **no password**. Protected API routes require an `Authorization: Bearer <token>` header. The server reloads the current user and validates their `status` and `authVersion` **on every request**, so stale roles in an otherwise valid token cannot grant access.

After authentication, per-route role middleware checks the requested action. **Record-scope checks are separate**, so a customer cannot read another customer's policy, requests or claims, and an agent sees only owned/assigned policies. Underwriters see policies with underwriting requests; adjusters see policies with claims; support has access to customer service records, while compliance is read-only. Reviews also prohibit **self-decision** even for a user holding multiple roles. Approved coverage changes are blocked when the policy's coverage changed after submission.

### Comprehensive profiles

Each user carries authentication metadata (user ID, username, bcrypt password hash, account status, role collection, last login, token version) and business data (names, DOB, contact and address, customer/employee number, user type, preferred contact, emergency contacts, customer category, beneficiary placeholder, department, job title, supervisor, internal access status, timestamps). `userId` aliases the existing UUID `id` without breaking previously seeded records. A `linkedPoliciesCount` is derived from policies. Password hashes and token versions are **never returned** in API responses.

Customers edit only whitelisted contact/profile fields. Staff support may edit only non-sensitive customer contact fields. Admins can edit business-profile fields and use dedicated routes to manage status and roles. No profile-update route permits a user to alter roles, account status or password hashes.

## REST API summary

| Feature | Protected endpoints |
|---|---|
| Auth | `POST /api/auth/login`, `GET /api/auth/me` |
| User profiles | `GET/PATCH /api/users/me`, `GET/POST /api/users`, `GET/PATCH /api/users/:id`, `PATCH /api/users/:id/contact`, `PATCH /api/users/:id/status` |
| RBAC (admin) | `GET /api/rbac/roles`, `GET /api/rbac/assignments`, `POST /api/rbac/users/:id/roles`, `DELETE /api/rbac/users/:id/roles/:role` |
| Policies | `GET/POST /api/policies`, `GET /api/policies/:id` |
| Amendments | `GET/POST /api/amendments`, `GET /api/amendments/:id`, `PATCH /api/amendments/:id/decision` |
| Reductions | `GET/POST /api/reductions`, `GET /api/reductions/:id`, `PATCH /api/reductions/:id/decision` |
| Claims | `GET/POST /api/claims`, `GET /api/claims/:id`, `PATCH /api/claims/:id/status`, `PATCH /api/claims/:id/decision` |
| Audit | `GET /api/audits` (admin/compliance only; latest 200 events) |

Mutations log an event. `401` means missing, invalid, expired or revoked authentication; `403` means authenticated but unauthorized; `400` indicates input validation; `404` is missing resource; and `409` is a workflow-state conflict. API errors do not return stack traces. Supported policy categories are **life**, **car** and **home**.

## Roles and separation of duties

| Role | Intended responsibilities | Disallowed by default |
|---|---|---|
| Customer | Own profile, policies, amendments, reductions, claims | Approvals, user/RBAC management, other customer records |
| Agent | Assigned customer profiles, create and service policies | Claim/underwriting decisions, RBAC |
| Underwriter | Review amendment and reduction requests, see related policy | Claim decisions, RBAC |
| Claims adjuster | View claims, mark under review, approve/reject with comment | Policy ownership changes, RBAC, underwriting decisions |
| Customer service | See customers/policies, limited contact edits, submit service requests | Approvals, RBAC |
| Compliance | Limited user directory, read-only business records, audit events | Mutations and decisions |
| Admin | All user/role and business operations, except self-review or lockout safeguards | Cannot deactivate own account/remove own admin role |

## Verify and capture assignment evidence

```bash
cd backend && npm test           # API integration tests + access-scope unit tests
cd ../frontend && npm run build  # Check Next.js production build
cd .. && docker compose config   # Validate Compose configuration
```

Continuous integration is provided by `.github/workflows/ci.yml` and runs backend tests and frontend build on pushes and pull requests.

## Security and deployment limitations

This is an instructional lab, not production software: file storage has no database transactions or process-level concurrency protection, session revocation is local-data based, there is no MFA/refresh-token flow, the demo accounts use known passwords, and the self-signed TLS certificate is for local testing. A real insurance deployment requires a proper database, managed HTTPS certificates, account recovery, encrypted backups, event retention controls, production secrets management and independent security review.
