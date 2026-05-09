# Waldur Admin UI

A teaching-oriented administrative interface for managing
[Waldur](https://waldur.com/)-based academic clouds, with first-class
support for Estonia's [ETAIS](https://etais.ee/).

Built as part of a Tallinn University of Technology master's thesis on
automated Infrastructure-as-Code (IaC) provisioning for university CS
courses.

## What it does

The platform sits between an instructor and the underlying Waldur
deployment, so a course can be set up in minutes instead of through a
sequence of cloud-team support tickets.

- Token-based authentication against Waldur with server-side sessions
- Project listing and creation
- Project members and roles
- Tenant ordering with quota configuration, edit, and deletion
- Tenant cards with auto-polling state badges
- Per-tenant security group management (create defaults: `ssh`, `web`,
  `ping`)
- **Terraform configuration generator** — pick tenants, security groups
  (per name), flavour, image, volume size; download a working `main.tf`
- Per-project billing view with monthly cost trends and per-tenant
  resource breakdown
- Per-tenant utilisation overview (CPU / RAM / storage)

## Layout

```
backend/      Node.js + Express; thin proxy over Waldur's REST API
frontend/     React 18 + TypeScript (Vite) single-page app
docker-compose.yml   Brings backend + frontend up locally
```

## Running locally

Prerequisites: Node 20+, npm.

```bash
# Backend
cd backend
cp .env.example .env       # edit if your Waldur endpoint differs
npm install
npm start                  # listens on :8000

# Frontend (separate terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                # serves on :5173
```

Then open http://localhost:5173 and log in with a Waldur API token from
your Waldur user profile.

## Companion repo

This UI is paired with a fork of the Waldur Terraform provider
generator that adds end-to-end security-group support
(post-create cascade to Neutron ports, schema fixes for nested
attributes). The Terraform configurations this UI generates are
designed to apply cleanly against either the upstream
`waldur/waldur` provider or the locally-built fixed provider.

## Status

Working but not yet a polished product. See the master's thesis for
the full design rationale, evaluation against real ETAIS deployments,
and the platform's roadmap.

## Licence

MIT — see [LICENSE](LICENSE).
