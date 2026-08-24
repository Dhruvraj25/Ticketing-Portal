# SupportHub — Enterprise Ticket Management

A full-stack ticket management platform built with **Next.js 16** (frontend) and **Express 5** (backend), using **PostgreSQL** with **Drizzle ORM**.

## Project Structure

```
/
├── frontend/          # Next.js application (App Router)
│   ├── app/           # Pages, API routes, server actions
│   ├── components/    # Shared UI components (shadcn/ui + dashboard)
│   ├── hooks/         # React hooks
│   ├── lib/           # Utilities, database schema, types
│   ├── public/        # Static assets
│   ├── package.json
│   ├── next.config.mjs
│   └── tsconfig.json
├── backend/           # Express.js API server
│   ├── src/           # Source code (routes, controllers, middleware, config)
│   ├── migrations/    # Database migrations
│   ├── package.json
│   └── tsconfig.json
├── docs/              # Documentation
├── .gitignore
└── README.md
```

## Prerequisites

- **Node.js** >= 18
- **pnpm** (recommended package manager)
- **PostgreSQL** 14+

## Quick Start

### 1. Environment Setup

Copy the example environment files and fill in your values:

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

### 2. Database

Start PostgreSQL (adjust for your setup):

```bash
# Using local PostgreSQL
createdb supporthub

# Or using Docker
docker run -d --name supporthub-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=supporthub \
  -p 5432:5432 \
  postgres:16-alpine
```

### 3. Install Dependencies

```bash
# Frontend (uses pnpm)
cd frontend
pnpm install

# Backend (uses npm)
cd ../backend
npm install
```

### 4. Run Database Migrations

```bash
cd backend
npm run migrate
```

### 5. Start Development Servers

Open two terminals:

```bash
# Terminal 1 — Backend (Express API)
cd backend
npm run dev
# Runs on http://localhost:4000

# Terminal 2 — Frontend (Next.js)
cd frontend
pnpm dev
# Runs on http://localhost:3000
```

### 6. Access the Application

Open **http://localhost:3000** in your browser.

## Default Admin Credentials

| Field    | Value                         |
|----------|-------------------------------|
| Name     | System Administrator          |
| Email    | admin@ticketingportal.com     |
| Password | Admin@123                     |
| Role     | admin                         |

> **IMPORTANT:** Change the admin password immediately after first login via the Admin → User Management panel.

## How Admin is Seeded

On first server startup, `frontend/lib/db/index.ts` runs `seedAdminUser()`:

1. Checks whether any user with `role = 'admin'` already exists in the database.
2. If none found, calls Better Auth's internal `signUpEmail` API to create the account.
3. Immediately promotes the new user to the `admin` role via a direct SQL update.
4. Logs the credentials to the server console.
5. On subsequent startups the check short-circuits — no duplicate admin is created.

## Registration

Public self-registration is **disabled**. The `/sign-up` route redirects to `/sign-in` and the Better Auth `disableSignUp: true` flag blocks the API endpoint directly.

Only an Admin can create new accounts via **Dashboard → Admin → User Management**.

## User Management (Admin only)

Admins can:
- **Create** users with any role (Admin / Project Manager / Developer / Client)
- **Edit** a user's role via the inline dropdown
- **Reset Password** via the actions menu
- **Activate / Deactivate** a user (deactivated users cannot sign in and have all active sessions revoked)
- **Delete** a user permanently

## Roles

| Role              | Access                                          |
|-------------------|-------------------------------------------------|
| `admin`           | Full access including user management           |
| `project_manager` | Ticket assignment, review queue, analytics      |
| `developer`       | Assigned tickets, time tracking, worklogs       |
| `client`          | Submit tickets, track status, approve resolutions |

## Environment Variables

### Frontend (`frontend/.env`)

| Variable                      | Required | Description                              |
|-------------------------------|----------|------------------------------------------|
| `DATABASE_URL`                | Yes      | PostgreSQL connection string             |
| `BETTER_AUTH_URL`             | Yes      | Frontend URL for Better Auth             |
| `BETTER_AUTH_SECRET`          | Yes      | Secret key for session encryption        |
| `CLOUDINARY_CLOUD_NAME`       | No       | Cloudinary cloud name (file uploads)     |
| `CLOUDINARY_API_KEY`          | No       | Cloudinary API key                       |
| `CLOUDINARY_API_SECRET`       | No       | Cloudinary API secret                    |
| `NODE_ENV`                    | No       | Environment mode (default: development)  |

### Backend (`backend/.env`)

| Variable                      | Required | Description                              |
|-------------------------------|----------|------------------------------------------|
| `DATABASE_URL`                | Yes      | PostgreSQL connection string             |
| `BETTER_AUTH_URL`             | Yes      | Backend URL for Better Auth              |
| `BETTER_AUTH_SECRET`          | Yes      | Secret key for session encryption        |
| `PORT`                        | No       | Server port (default: 4000)              |
| `FRONTEND_URL`                | No       | Frontend URL for CORS (default: http://localhost:3000) |
| `CLOUDINARY_CLOUD_NAME`       | No       | Cloudinary cloud name (file uploads)     |
| `CLOUDINARY_API_KEY`          | No       | Cloudinary API key                       |
| `CLOUDINARY_API_SECRET`       | No       | Cloudinary API secret                    |
| `NODE_ENV`                    | No       | Environment mode (default: development)  |

## Email System

All application email is handled by a centralized, provider-independent email service in the backend (`Backend/src/services/email/`). Business logic never talks to a provider directly — it calls the email service, which delegates to the provider selected by `EMAIL_PROVIDER`:

| `EMAIL_PROVIDER` | Behaviour                                                    |
|------------------|--------------------------------------------------------------|
| `console`        | (default) logs emails to the backend console — never sends   |
| `resend`         | sends via the Resend API (requires `RESEND_API_KEY`)         |
| `microsoft-smtp` | Microsoft 365 SMTP via OAuth 2.0 / XOAUTH2 (Nodemailer → `smtp.office365.com:587`) |
| `microsoft`      | **deprecated alias** for `microsoft-smtp` (kept for compatibility) |

Backend environment variables (`Backend/.env`):

| Variable                  | Required | Description                                            |
|---------------------------|----------|--------------------------------------------------------|
| `EMAIL_PROVIDER`          | No       | Provider: `console`, `resend`, or `microsoft-smtp` (default: console when no `RESEND_API_KEY`) |
| `EMAIL_FROM`              | No       | Sender address (default: `support@infinixotech.com`)   |
| `EMAIL_FROM_NAME`         | No       | Sender display name (default: `SupportHub`)            |
| `RESEND_API_KEY`          | No       | Only needed for `EMAIL_PROVIDER=resend`                |
| `MICROSOFT_TENANT_ID`     | No       | Microsoft 365 SMTP — Entra tenant ID                   |
| `MICROSOFT_CLIENT_ID`     | No       | Microsoft 365 SMTP — existing Entra app client ID      |
| `MICROSOFT_CLIENT_SECRET` | No       | Microsoft 365 SMTP — Entra app client secret (backend-only) |
| `MICROSOFT_SENDER_EMAIL`  | No       | Microsoft 365 SMTP — mailbox the app is authorized to send as (default: `support@infinixotech.com`) |
| `MICROSOFT_SMTP_HOST`     | No       | Microsoft 365 SMTP host (default: `smtp.office365.com`) |
| `MICROSOFT_SMTP_PORT`     | No       | Microsoft 365 SMTP port (default: `587`, STARTTLS)     |

Microsoft credentials are backend-only and must never be exposed to the frontend (no `VITE_*` / `NEXT_PUBLIC_*` variants). The frontend only bridges to the backend email service via `Frontend/lib/email-backend.ts`.

## Microsoft 365 SMTP Setup (`EMAIL_PROVIDER=microsoft-smtp`)

### Architecture

```
NotificationDispatcher
    ↓
email.service.ts
    ↓
email.queue.ts
    ↓
EmailProvider (microsoft-smtp)
    ↓
Nodemailer (XOAUTH2)
    ↓
smtp.office365.com:587 (STARTTLS)
    ↓
Exchange Online → MICROSOFT_SENDER_EMAIL
```

### Existing Entra Application

This integration **reuses the existing Entra application** ("SMTP Oauth"). Do **not** create a new app registration, client ID, tenant ID, or client secret. The existing Microsoft Graph `Mail.Send` application permission is kept as-is (it does **not** authorize SMTP) and may be used later as a fallback.

### SMTP OAuth Flow

- Grant type: **client credentials** (app-only, no user).
- Token resource/scope: **`https://outlook.office365.com/.default`** — the Exchange Online SMTP resource. Do **not** use `https://graph.microsoft.com/.default` for SMTP.
- Nodemailer authenticates with **XOAUTH2** using the access token (`auth.type = 'OAuth2'`). No mailbox password, no basic `AUTH LOGIN`/`AUTH PLAIN`.
- Tokens are cached: `ClientSecretCredential` (via `@azure/identity`) reuses a valid token and Nodemailer's `provisionCallback` only re-acquires near-expiry tokens.

### Required Microsoft 365 Authorization (administrator tasks)

These are intentionally **not automated** — complete them in the Microsoft 365 admin center before live delivery:

1. **Office 365 Exchange Online API → Application permissions → `SMTP.SendAsApp`** (add to the existing Entra application).
2. **Admin consent** for the application permission.
3. **Exchange Online service-principal registration**: register the application's service principal in Exchange Online.
4. **Mailbox authorization**: authorize the application to send as `MICROSOFT_SENDER_EMAIL` (`support@infinixotech.com`).
5. **SMTP AUTH**: verify SMTP AUTH is enabled for the mailbox/tenant.

Until these are done, the provider fails safely (emails are rejected, never faked) and the app keeps running.

### Local Test Procedure

```bash
cd Backend
npm install
# Set the backend .env values (MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, …)
TEST_EMAIL_TO=you@example.com npm run test:microsoft-smtp
```

The script acquires an Entra token, connects to `smtp.office365.com:587`, authenticates with XOAUTH2 and sends one test email. If Exchange authorization is still pending it prints:

```
Microsoft SMTP authentication could not be completed.
The code is configured, but Exchange Online SMTP authorization is still pending.
```

### Production (Railway) Configuration

Set these backend variables on Railway (never on the frontend/Netlify):

```
EMAIL_PROVIDER=microsoft-smtp
EMAIL_FROM=support@infinixotech.com
EMAIL_FROM_NAME=SupportHub
MICROSOFT_TENANT_ID=…
MICROSOFT_CLIENT_ID=…
MICROSOFT_CLIENT_SECRET=…
MICROSOFT_SENDER_EMAIL=support@infinixotech.com
MICROSOFT_SMTP_HOST=smtp.office365.com
MICROSOFT_SMTP_PORT=587
```

### Security Notes

- The client secret lives **only** in backend environment variables — never in frontend env files, source code, logs, or documentation.
- Tokens, client secrets, authorization headers and password-reset tokens are never logged.
- TLS certificate validation is never disabled; port 587 uses STARTTLS (`secure: false` + `requireTLS: true`).
- If a client secret was previously exposed, rotate it inside the **same** Entra application — do not create a new app.

## Package Manager

- **Frontend**: Uses **pnpm** (lock file: `pnpm-lock.yaml`)
- **Backend**: Uses **npm** (lock file: `package-lock.json`)

## Available Scripts

### Frontend

| Script   | Command        | Description              |
|----------|----------------|--------------------------|
| `dev`    | `pnpm dev`     | Start dev server         |
| `build`  | `pnpm build`   | Production build         |
| `start`  | `pnpm start`   | Start production server  |
| `lint`   | `pnpm lint`    | Run ESLint               |

### Backend

| Script             | Command               | Description                 |
|--------------------|-----------------------|-----------------------------|
| `dev`              | `npm run dev`         | Start dev server with watch |
| `build`            | `npm run build`       | TypeScript compilation      |
| `start`            | `npm start`           | Start production server     |
| `migrate`          | `npm run migrate`     | Push Drizzle schema to DB   |
| `migrate:generate` | `npm run migrate:generate` | Generate migration files |
