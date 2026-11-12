# NorthStar Insurance & Financial Services — Secure Full-Stack Lab

A teaching prototype built with **Express/Node.js over HTTPS** and **Next.js/React**, using JWT authentication, admin-managed RBAC, ownership checks, and workflows for life/car/home policies, amendments, reductions, and claims.

## Requirements
- Node.js 20.9+ and npm
- OpenSSL available in PATH
- Two terminal sessions (backend + frontend)

## Backend setup
```bash
cd backend
npm install
cp .env.example .env
# Replace JWT_SECRET in .env with a unique random value (at least 32 characters)
bash scripts/cert.sh
npm run seed
npm run dev
```
For Windows PowerShell, use `Copy-Item .env.example .env` and run the OpenSSL command in `scripts/cert.sh` manually, or use Git Bash. Browse `https://localhost:8443/api/health` and **trust the development certificate only for local testing**. A self-signed certificate produces a trust warning until explicitly trusted; never disable TLS certificate verification in code.

## Frontend setup
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```
Open http://localhost:3000. The frontend is served over HTTP for local lab development; **API traffic is HTTPS**. 

## Demo accounts
All demo accounts share the password `DemoPass123!` **only for this local lab**. Accounts: `admin`, `customer`, `customer2`, `agent`, `underwriter`, `adjuster`, `service`, `compliance`. Seed only once; demo records live in `backend/data/store.json` (git-ignored).

## Architecture and permissions
- Backend: `src/app.js` composes Express middleware and resource routers, `src/server.js` serves TLS, `middleware/auth.js` validates JWT and authorization, `services/db.js` persists a small JSON test store and audit events.
- Frontend: Next.js App Router. `src/lib/api.js` sends HTTPS requests with bearer tokens. Session token stays in memory rather than localStorage. A page refresh requires sign-in again.
- JWT: signed HS256 bearer access token contains subject, username, roles, token version, issued-at, and expiry. Server verifies JWT signature/expiry and **reloads current user/roles/status** each request. Changes to roles/status increment `authVersion` and immediately invalidate previous tokens.
- Customer ownership is enforced server-side for policies, amendment/reduction requests, and claims. Staff is authorized by role and scope. Compliance has read-only access; only admin manages role assignments.
- Profiles separate auth fields from business/contact fields; public responses omit password hashes. Customers can edit only whitelisted contact fields. Admin can edit additional profile fields.
- `/api/users` provides admin directory and limited compliance view; `/api/rbac` is admin only.

## Test and verification
```bash
cd backend
npm test
```
Tests cover successful and invalid logins, missing/invalid tokens, customer isolation, admin role assignment and revocation, policy creation, underwriting approvals, claims decisioning, and disabled-user rejection. Record screenshots from an actual browser for submission; the report includes an evidence checklist, not fabricated screenshots.

## API route summary
`POST /api/auth/login`, `GET /api/auth/me`, `GET/PATCH /api/users/me`, `GET/POST /api/users`, `GET/PATCH /api/users/:id`, `PATCH /api/users/:id/status`, `GET /api/rbac/roles`, `GET /api/rbac/assignments`, `POST /api/rbac/users/:id/roles`, `DELETE /api/rbac/users/:id/roles/:role`, `GET/POST /api/policies`, `GET /api/policies/:id`, `GET/POST /api/amendments`, `PATCH /api/amendments/:id/decision`, `GET/POST /api/reductions`, `PATCH /api/reductions/:id/decision`, `GET/POST /api/claims`, `PATCH /api/claims/:id/decision`.

## Docker Compose (local lab only)
From the repository root:

```bash
cp .env.docker.example .env
# Edit .env: set JWT_SECRET to an unpredictable secret of 32+ characters.
docker compose up --build -d
docker compose logs -f backend
```

Open **http://localhost:3000** for the Next.js frontend and **https://localhost:8443/api/health** for the Express HTTPS backend. The API uses a generated **self-signed development** certificate stored in a Docker volume. To use the browser frontend, you must trust this local certificate through your development machine's certificate trust process; do not suppress TLS validation in application code. The frontend is HTTP-only in this lab; for a real deployment, put both frontend and backend behind trusted HTTPS ingress/reverse proxy.

Initial demo data is seeded automatically on an empty data volume. Demo usernames and passwords are described above. The `northstar_data` and `northstar_certs` volumes persist data and TLS material across ordinary container restarts. `docker compose down -v` **deletes both volumes and all lab data**; use only when intentionally resetting the demo.

Docker configuration includes `backend/Dockerfile`, `frontend/Dockerfile`, `.dockerignore` files, `backend/docker-entrypoint.sh`, and root `compose.yaml`.
