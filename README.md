# Freight Marketplace Dashboard

An AI-assisted TMS dashboard for a freight carrier: browse and track inbound/outbound loads, place
bids on outbound loads by email or call, and manage the resulting bid conversations through to
acceptance, rejection, or cancellation.

Built as a scoped, time-boxed exercise — see [Known limitations & deliberate scope cuts](#known-limitations--deliberate-scope-cuts)
for what was intentionally left out and why, rather than silently missing.

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [API overview](#api-overview)
- [Data model](#data-model)
- [Known limitations & deliberate scope cuts](#known-limitations--deliberate-scope-cuts)
- [Development commands](#development-commands)

## Features

**Loads**
- Structured search/filter panel (direction: all/outbound/inbound, origin/destination city+state,
  equipment type, max weight) plus free-text search by shipper, order ID, or city — filters apply
  immediately, no separate "search" step.
- Load detail drawer with **Load / Stop Information / Customer / Lane / Map** tabs — order ID, route,
  shipment details, per-stop pickup/delivery info, customer contact, lane rate info, and an
  interactive route map.
- **Create Order**, **Edit**, and **Delete** (delete is blocked with a `409` if the load has any
  bids — bid history is never silently orphaned).
- **Mark Arrived** per stop records an actual arrival timestamp; the load's status
  (`available → bid_placed → booked → in_transit → delivered`) rolls up automatically from its
  stops' actuals — this is the real tracking mechanism, not just a manually-set label.
- Interactive **route map** (Leaflet + OpenStreetMap tiles, road-following polyline from the public
  OSRM routing API, no API key required) with numbered pickup/delivery markers and a distance/ETA
  readout.
- Bulk load selection → **Generate Bids** modal to place bids across many loads in one pass.

**Bids**
- **Place Bid** modal, two methods:
  - **Email** — real send via [Resend](https://resend.com); target amount with an **All-In ⇄
    Rate-Per-Mile** toggle that live-computes the other value from the load's distance; broker email
    pre-filled from the load (editable); subject/body composed by the carrier.
  - **Call** — shown for discoverability (matches the reference product's method toggle) but
    intentionally not wired to a real telephony/voice pipeline yet — see
    [scope cuts](#known-limitations--deliberate-scope-cuts). Selecting it shows a "coming soon" panel
    instead of submitting anything.
- **✨ AI rate suggestion** (via [Groq](https://groq.com)) shown in the Place Bid modal — an
  LLM-estimated historical rate for the load's lane, with a one-click "use this" to fill the amount
  field. Optional: the form works identically with no Groq key configured, it just shows nothing.
- **My Bids** view, bucketed into **In Progress / Accepted / Rejected / Completed** (a bid whose load
  has been delivered shows as Completed regardless of how the bid itself closed).
- Per-bid actions: **Mark Accepted / Mark Rejected / Cancel**, each firing a templated follow-up
  email recorded in that bid's conversation history.
- **Email conversation history** per bid — the original bid email plus every follow-up (acceptance/
  rejection notice, manual reply) is persisted and viewable, not just the latest message.

**Auth**
- Email/password signup and login, JWT bearer tokens (access-token-only — see scope cuts), a
  dashboard gate that redirects unauthenticated users to `/login`.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, SWR |
| Backend | FastAPI, Python 3.12+, Pydantic v2, SQLAlchemy 2.0 (async) |
| Database | SQLite (async, via `aiosqlite`) — schema/migrations are Postgres-portable |
| Migrations | Alembic |
| Maps | react-leaflet + OpenStreetMap tiles + OSRM public routing API |
| Integrations | Resend (email), Groq (AI rate suggestion) — both optional, env-gated |
| Package managers | `npm` (frontend), `uv` (backend) |

Engineering conventions (layering, naming, error handling, etc.) are documented in full in
[CLAUDE.md](CLAUDE.md); this README is the practical getting-started companion to that standard.

## Project structure

```
freight-marketplace/
├── app/                       # Next.js App Router: layout, dashboard page, login/signup
├── features/
│   ├── auth/                  # AuthForm, AuthGate (redirect-if-unauthenticated)
│   ├── loads/                 # LoadsView, LoadCard, LoadDetailDrawer, LoadFormModal,
│   │                          # LoadSearchPanel, RouteMap
│   └── bids/                  # BidsView, PlaceBidModal, BulkBidModal, BidActionsMenu,
│                              # ViewEmailModal, emailTemplates
├── components/ui.tsx          # Shared primitives: Button, Modal, Drawer, Badge, EmptyState, Spinner
├── lib/                       # api.ts (typed fetch client), auth.ts, format.ts, types.ts
└── server/                    # FastAPI backend (separate deployable unit, own dependency tree)
    ├── app/
    │   ├── api/v1/            # loads.py, bids.py, auth.py — thin routers
    │   ├── core/              # config (Settings), database (async engine/session), security, logging
    │   ├── domain/             # LoadService, BidService, AuthService — business logic
    │   ├── integrations/       # EmailProvider (Resend), RateSuggestionProvider (Groq)
    │   ├── models/             # SQLAlchemy models: Load, Stop, Bid, BidEmail, User
    │   ├── repositories/        # Data access, one per aggregate root
    │   ├── schemas/            # Pydantic request/response schemas
    │   └── main.py             # App assembly, CORS, global exception handlers
    ├── alembic/                # Migrations
    └── seed.py                 # Sample loads/stops/bids (stands in for real load-board sourcing)
```

## Getting started

### Prerequisites

- Node.js 20+ and `npm`
- Python 3.12+ and [`uv`](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`)

### Backend

```bash
cd server
cp .env.example .env          # fill in RESEND_API_KEY / GROQ_API_KEY if you have them — both optional
uv run alembic upgrade head    # create the SQLite schema
uv run python seed.py          # populate sample loads/stops/bids
uv run uvicorn app.main:app --reload --port 8000
```

The API is now at `http://localhost:8000/api/v1`, with interactive docs at `http://localhost:8000/docs`.

### Frontend

```bash
cp .env.example .env.local     # NEXT_PUBLIC_API_BASE_URL, defaults to the backend above
npm install
npm run dev
```

Open `http://localhost:3000`, sign up for an account (email/password — no invite/verification flow),
and you'll land on the dashboard.

### Verifying it's wired correctly

```bash
curl http://localhost:8000/health
# {"status":"ok","email_live":true|false,"rate_suggestion_live":true|false}
```

`email_live`/`rate_suggestion_live` reflect whether `RESEND_API_KEY`/`GROQ_API_KEY` are set — both
features work with them unset, they just fall back to a recorded/no-suggestion state instead of
erroring.

## Environment variables

**`server/.env`** (see `server/.env.example`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./freight.db` | Async SQLAlchemy connection string |
| `RESEND_API_KEY` | unset | Enables real email sending; unset → bids record as `recorded` instead of `sent` |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` | Sender address (Resend's keyless sandbox sender can only deliver to your own Resend account email — verify a domain to send elsewhere) |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | CORS allowlist entry |
| `JWT_SECRET_KEY` | dev-only default | **Must** be overridden outside local dev |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `JWT_EXPIRES_MINUTES` | `1440` (24h) | Access token lifetime (no refresh-token flow — see scope cuts) |
| `GROQ_API_KEY` | unset | Enables the AI rate suggestion; unset → the endpoint returns `null` |
| `GROQ_MODEL` | `llama-3.1-8b-instant` | Groq model used for the rate estimate |

**`.env.local`** (frontend root, see `.env.example`)

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000/api/v1` | Base URL the frontend's API client talks to |

## API overview

All routes are versioned under `/api/v1` and (except `/auth/signup`, `/auth/login`) require a
`Authorization: Bearer <token>` header. Errors return a consistent envelope:
`{"error": {"code", "message", "details", "correlation_id"}}`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/signup` | Create an account, receive an access token |
| POST | `/auth/login` | Log in, receive an access token |
| GET | `/auth/me` | Current user |
| GET | `/loads` | Paginated list (`direction`, `status`, `limit`, `offset` filters) |
| GET | `/loads/{id}` | Full detail — stops, customer, driver, lane |
| POST | `/loads` | Create Order (with nested stops) |
| PATCH | `/loads/{id}` | Edit (partial update) |
| DELETE | `/loads/{id}` | Delete — `409` if the load has any bids |
| PATCH | `/loads/{id}/stops/{stop_id}` | Record a stop's actual arrival (Mark Arrived) |
| GET | `/loads/{id}/rate-suggestion` | AI-estimated historical rate for this lane (or `null`) |
| POST | `/loads/{id}/bids` | Place a bid (email or call) |
| GET | `/bids` | Paginated My Bids list (`method`, `status` filters) |
| PATCH | `/bids/{id}/status` | Carrier decision: `accepted` / `rejected` / `cancelled` |
| GET | `/bids/{id}/emails` | Full email conversation history for a bid |
| POST | `/bids/{id}/emails` | Send a follow-up email (acceptance/rejection notice, manual reply) |

Full interactive reference (request/response schemas, examples) is auto-generated at `/docs` once
the backend is running — kept accurate by design (CLAUDE.md §9.10), not hand-maintained here.

## Data model

Four tables, UUID primary keys, `created_at`/`updated_at` audit columns on all of them.

- **`loads`** — lane (origin/destination city, state, lat/lng), shipment details (distance, weight,
  equipment, posted rate, deadhead), source, broker contact (pre-fills bid forms), status, embedded
  customer and driver contact info.
- **`stops`** — pickup/delivery points on a load's route, `FK → loads (ON DELETE CASCADE)`,
  scheduled time, and `actual_arrival_time` (the tracking mechanism).
- **`bids`** — one table for both methods (nullable method-specific columns rather than a table per
  method — see CLAUDE.md's KISS/YAGNI rationale in the codebase), `FK → loads (ON DELETE RESTRICT)`
  so bid history can never be silently orphaned by a load deletion.
- **`bid_emails`** — the full email conversation history for a bid (original bid email plus every
  follow-up), `FK → bids (ON DELETE CASCADE)`.
- **`users`** — email/password (bcrypt-hashed) for JWT auth.

## Known limitations & deliberate scope cuts

Documented explicitly so nothing reads as an oversight:

- **No real voice/call bidding.** The reference product's "auto agent" call is a full real-time
  conversational voice AI (STT → LLM → TTS, live telephony), not a simple announcement — a
  significant build in its own right. The Call method is visible in the UI for discoverability but
  shows "coming soon" rather than submitting anything.
- **No JWT refresh tokens** — access-token-only with a generous (24h) expiry. A production build
  would add a rotated refresh token in an `httpOnly` cookie per CLAUDE.md §10.3.
- **No soft deletes / status-history audit table.** Load/bid status changes overwrite the column
  rather than appending to an audit trail; a "who changed what, when" history table is the natural
  next step if compliance/audit needs arise.
- **No rate limiting or idempotency keys** on write endpoints — acceptable for a single-carrier local
  build, not for a multi-tenant production deployment.
- **No real load-board sourcing.** Loads are seeded sample data (`server/seed.py`) standing in for
  the real scraping/ingestion pipeline (DAT, Uber Freight, etc.) implied by the `source` field.
- **No Market Intelligence rate-benchmarking panel** (the reference product's Hist Avg/SONAR/Range
  stats) — that's a paid, non-self-serve third-party data product (DAT SONAR); the AI rate suggestion
  above is a different, self-serve stand-in for the same intent.
- **No automated test suite yet.** Given the time-boxed nature of this build, verification was done
  via direct end-to-end exercising of each flow (see the `/health` endpoint and manual curl/browser
  checks) rather than a written test suite — the highest-value next addition would be service-layer
  unit tests for `BidService`/`LoadService` per CLAUDE.md §12.
- **SQLite, not Postgres.** Same async SQLAlchemy models and Alembic migration pattern either way —
  switching is a one-line `DATABASE_URL` change, not a rewrite.

## Development commands

```bash
# Frontend
npm run dev          # dev server
npm run build         # production build
npm run lint          # ESLint
npx tsc --noEmit       # type-check

# Backend (from server/)
uv run uvicorn app.main:app --reload --port 8000
uv run alembic revision --autogenerate -m "..."   # new migration
uv run alembic upgrade head
uv run python seed.py
```
