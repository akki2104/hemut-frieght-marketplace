@AGENTS.md

# Freight Marketplace — Engineering Handbook

This document is the single source of truth for how code is written, reviewed, and shipped in this
repository. It is written for two audiences at once: human engineers and AI coding agents. Both are
held to the same bar. If a rule here conflicts with a convenience shortcut, the rule wins — raise it
in review instead of silently deviating.

**Stack at a glance** (update this block the day the stack changes, not after):

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS v4 |
| Backend | FastAPI, Python 3.12+, Pydantic v2, SQLAlchemy 2.0 (async) |
| Database | PostgreSQL 16+ |
| Migrations | Alembic |
| Package managers | `npm` (frontend), `uv` or `poetry` (backend — pick one, do not mix) |
| Containers | Docker, Docker Compose |
| CI/CD | GitHub Actions |

The domain is a **freight marketplace**: shippers post loads, carriers quote and book them, drivers
execute them. Canonical entities used in examples throughout this doc: `Shipment`, `Load`, `Quote`,
`Carrier`, `Shipper`, `Driver`, `Booking`, `Invoice`. Use these (or their real equivalents once built)
in your own examples and tests instead of inventing `Foo`/`Bar`/`Item`.

> **Scope note:** at the time of writing this repo is a fresh `create-next-app` scaffold. The backend,
> database, and CI pipeline described below do not exist yet. This document describes the standard
> they must be built to — it is normative for anything you add, not a description of what already
> exists. Do not tell a user "this doesn't match the current code" as a reason to ignore a rule; it
> means the rule applies the moment you write that code.

---

## Table of Contents

1. [Project Philosophy](#1-project-philosophy)
2. [Folder Structure Rules](#2-folder-structure-rules)
3. [Naming Conventions](#3-naming-conventions)
4. [Code Style](#4-code-style)
5. [Architecture Rules](#5-architecture-rules)
6. [Frontend Standards](#6-frontend-standards)
7. [Backend Standards](#7-backend-standards)
8. [Database Standards](#8-database-standards)
9. [API Standards](#9-api-standards)
10. [Security Standards](#10-security-standards)
11. [Performance Standards](#11-performance-standards)
12. [Testing Standards](#12-testing-standards)
13. [Git Workflow](#13-git-workflow)
14. [Documentation Standards](#14-documentation-standards)
15. [Logging Standards](#15-logging-standards)
16. [Error Handling](#16-error-handling)
17. [Environment Management](#17-environment-management)
18. [Docker Standards](#18-docker-standards)
19. [CI/CD Standards](#19-cicd-standards)
20. [AI Agent Rules](#20-ai-agent-rules)
21. [Code Review Checklist](#21-code-review-checklist)
22. [Best Practices Reference](#22-best-practices-reference)

---

## 1. Project Philosophy

Every decision in this codebase is judged against seven properties, in this priority order when they
conflict: **Security > Correctness > Maintainability > Readability > Performance > Scalability >
Developer Experience**. Performance and scalability sit below maintainability deliberately — a fast
system nobody can safely change is a liability in a marketplace that will run for years and touch
money (freight invoices, carrier payouts) and physical goods.

### 1.1 Maintainability

- Code is read 10-20x more often than it is written. Optimize for the next reader, who has none of
  the context you have right now.
- Prefer boring, explicit solutions over clever ones. A `for` loop that is obviously correct beats a
  one-line reduce that requires re-reading twice.
- Every abstraction must pay rent. If a `Repository` interface has exactly one implementation and no
  planned second one, it is not earning its complexity — see [YAGNI](#54-yagns).
- Local reasoning matters: a reviewer should be able to understand a function's correctness by
  reading the function and its direct callees, not by tracing state through five files.
- Delete dead code immediately. Commented-out code, unused exports, and `// TODO: remove` blocks rot
  into landmines. Git history is the archive, not the source tree.

### 1.2 Readability

- Code should read like well-written prose: the "what" should be obvious from names, the "why"
  should be in a comment only when it is genuinely non-obvious (a workaround, a regulatory
  constraint, a subtle invariant).
- A new engineer should be able to open any file and understand its purpose within 30 seconds from
  its name, location, and top-level exports — before reading a single line of logic.
- Prefer many small, well-named functions over few large ones with internal section comments like
  `// --- validation ---`. If you need a comment to delimit a section, that section is a function.

### 1.3 Scalability

- Design for the load pattern of a two-sided marketplace: bursty writes (loads posted in batches by
  large shippers), read-heavy browsing (carriers searching for loads), and consistency-critical
  writes (booking a load, which must not double-allocate).
- Horizontal scalability is the default assumption for the API layer: no in-memory session state, no
  local file storage for anything that must survive a restart, no assumption that two requests from
  the same user hit the same process.
- Database is the first bottleneck in almost every real system. Design schemas and queries assuming
  10x today's data volume, not "however much fits on my laptop."

### 1.4 Performance

- Correctness first, then measure, then optimize. Do not hand-optimize code with no profiling data
  behind it — this wastes reviewer time and often makes code harder to read for no measured gain.
- Every list endpoint must be paginated by default (see [§9](#9-api-standards)). Unbounded queries
  against a growing `loads` or `shipments` table are the single most common production incident in
  systems like this.
- N+1 queries are treated as bugs, not style nits (see [§8](#8-database-standards) and
  [§11](#11-performance-standards)).

### 1.5 Security

- Security is not a phase, it is a property every change must maintain. See [§10](#10-security-standards)
  for the full standard; the philosophy is: validate all input at the boundary, trust nothing from
  the client (including things the UI "shouldn't allow"), and assume every secret will eventually
  leak if handled carelessly, so handle it as if it already has.
- This domain has financial data (rates, invoices, payouts) and PII (driver identity, carrier
  insurance documents). Treat every new field with a default posture of "this is sensitive until
  proven otherwise," not the reverse.

### 1.6 Developer Experience

- A slow or flaky local dev loop is a tax on every future change. `npm run dev` and the backend's
  equivalent must work with a single documented setup step (`docker compose up`, one `.env.example`
  to copy).
- Type errors, lint errors, and test failures must be caught locally before CI, and CI must be the
  backstop, not the primary line of defense — see [§19](#19-cicd-standards).
- Error messages (compiler, linter, runtime) are a UX surface. When you write a custom exception or
  validation error, write the message for the human who will read it at 2am during an incident.

### 1.7 Enterprise Coding Standards

- Assume 100+ engineers will touch this code over its lifetime, most of whom you will never meet.
  Consistency beats individual preference every time — if this document says one thing and your
  personal style says another, this document wins.
- No "clever" one-off patterns per feature. If you need a new pattern (a new state management
  approach, a new way of structuring API responses), it goes through review as an explicit proposal
  (an ADR, see [§14](#14-documentation-standards)), not as a silent addition inside a feature PR.
- Backward compatibility of public contracts (API responses, database schemas, exported types) is a
  first-class concern. Breaking changes require the versioning strategy in [§9.2](#92-versioning).

---

## 2. Folder Structure Rules

### 2.1 Top-level layout

```
freight-marketplace/
├── app/                    # Next.js App Router (routes, layouts, pages)
├── components/             # Shared/reusable React components
├── features/                # Feature-first modules (see 2.4)
├── lib/                    # Framework-agnostic frontend utilities, API client, hooks
├── server/                 # FastAPI backend (own package, own dependency tree)
│   ├── app/
│   │   ├── api/            # Routers, one module per resource
│   │   ├── core/           # Config, security, logging setup
│   │   ├── domain/         # Domain/business logic (services)
│   │   ├── models/         # SQLAlchemy models
│   │   ├── repositories/   # Data-access layer
│   │   ├── schemas/        # Pydantic request/response models
│   │   └── main.py
│   ├── alembic/             # Migrations
│   └── tests/
├── docs/                   # Architecture docs, ADRs
├── docker/                 # Dockerfiles, compose overrides
└── CLAUDE.md
```

Frontend and backend are separate deployable units with separate dependency manifests
(`package.json` vs `pyproject.toml`/`requirements.txt`). Never let the frontend import Python or the
backend import TypeScript — the boundary between them is the HTTP API defined in [§9](#9-api-standards),
nothing else. If they need to share a contract (e.g., an enum of shipment statuses), duplicate it
explicitly in both languages with a code comment cross-referencing the other file, or generate one
from an OpenAPI schema — do not attempt a cross-language import hack.

### 2.2 When to create a folder

Create a new folder when:
- A feature has 3+ files that belong together (e.g., a `load-board` feature with a component, a
  hook, and a set of types).
- A concern is reused across 2+ features (promote to `components/` or `lib/`, see 2.5).
- A backend resource has its own router, service, repository, and schema (e.g., `shipments/`).

### 2.3 When NOT to create a folder

- Do not create a folder for a single file. `components/Button/Button.tsx` with nothing else in
  `Button/` is a wrapper folder that adds a directory hop for no benefit — just `components/Button.tsx`.
- Do not create speculative folders ("we'll need `analytics/` eventually"). Create it in the PR that
  actually adds analytics.
- Do not create a `utils/` or `helpers/` folder as a place to put things you didn't want to name
  properly. Every folder must have a name that describes its *contents' shared purpose*, not their
  lack of a home. If you're reaching for `utils/`, first ask whether the function belongs next to
  its single caller instead.

### 2.4 Feature-first vs layer-first

**Feature-first is the default** for the frontend. Group by what the code does for the user
(`features/load-board/`, `features/carrier-onboarding/`, `features/invoicing/`) rather than by
technical layer (`components/`, `hooks/`, `types/` all mixed with everything else).

```
features/
└── load-board/
    ├── components/
    │   ├── LoadCard.tsx
    │   └── LoadFilters.tsx
    ├── hooks/
    │   └── useLoadSearch.ts
    ├── api.ts              # API calls scoped to this feature
    ├── types.ts
    └── index.ts            # Public exports only
```

Rationale: when a feature is deleted or rewritten, feature-first lets you delete one folder. Layer-
first scatters that feature's code across five top-level folders and guarantees stale imports.

**Layer-first is correct for the backend**, because FastAPI's own conventions (routers, dependencies,
services, repositories) are horizontal layers that many resources plug into uniformly, and Python's
import ergonomics favor it. Within `server/app/api/`, subdivide by resource
(`api/shipments.py`, `api/carriers.py`), which is itself a light feature-first split at the router
level.

**Truly shared code** (used by 2+ features, no feature owns it) lives in top-level `components/`
(frontend) or `core/` (backend) — never inside a feature folder that other features then reach into.

### 2.5 Shared code rules

- A component moves from `features/X/components/` to top-level `components/` the moment a *second*
  feature needs it — not before (YAGNI), and not late (once 3+ features import across feature
  boundaries, that's a signal debt has already accrued).
- Shared components must be free of feature-specific business logic. `components/Button.tsx` must
  not know what a `Load` is. If a "shared" component needs domain knowledge, it's not actually
  shared — split the generic shell (shared) from the domain wrapper (feature-local).
- Only export what a feature intends to be public, via a single `index.ts`. Other features import
  `from '@/features/load-board'`, never
  `from '@/features/load-board/components/internal/LoadCardSkeleton'`.

### 2.6 Naming conventions for folders

- `kebab-case` for all folders: `load-board/`, `carrier-onboarding/`, not `loadBoard/` or `LoadBoard/`.
- Plural for collections of similar things (`components/`, `hooks/`, `repositories/`), singular for
  a single concern (`core/`, `domain/`).
- Route folders in `app/` follow Next.js conventions exactly — see [§6.1](#61-nextjs-app-router-conventions).

### 2.7 Maximum folder nesting

Maximum **4 levels** deep from the nearest package root (`app/`, `features/`, `server/app/`) before
you must reconsider the structure. Example of the limit:
`features/load-board/components/LoadCard.tsx` (3 levels) is fine.
`features/load-board/components/cards/variants/CompactLoadCard.tsx` (5 levels) is a smell — flatten
by naming the file `LoadCardCompact.tsx` directly under `components/`, or promote `cards/` to its own
feature if it has genuinely independent complexity.

Deep nesting is a proxy for missing abstraction boundaries: if you need 6 folders to describe where
something lives, you likely haven't decided what it *is* yet.

---

## 3. Naming Conventions

General rule: **names describe intent and domain meaning, not implementation**. `activeLoads` not
`loadsArray`. `getExpiredQuotes` not `getQuotesHelper2`.

| Kind | Convention | Correct | Incorrect |
|---|---|---|---|
| Variables | `camelCase`, descriptive, no abbreviations | `pendingBookingCount` | `pbc`, `cnt`, `data2` |
| Booleans | `is`/`has`/`should`/`can` prefix | `isBookingConfirmed`, `hasInsurance` | `booked`, `flag` |
| Functions | `camelCase`, verb-first | `calculateQuotePrice()`, `fetchCarrierById()` | `quotePrice()`, `carrier()` |
| React components | `PascalCase`, noun | `LoadCard`, `CarrierProfileForm` | `loadCard`, `Card1` |
| Hooks | `use` + `camelCase` | `useLoadSearch`, `useDebouncedValue` | `loadSearchHook`, `LoadSearch` |
| Classes (Python) | `PascalCase`, noun | `ShipmentRepository`, `QuoteService` | `shipment_repo`, `Manager` |
| Interfaces/Types (TS) | `PascalCase`, no `I` prefix | `Shipment`, `CreateLoadRequest` | `IShipment`, `ShipmentType` |
| Enums | `PascalCase` type, `PascalCase` or `SCREAMING_SNAKE` members (be consistent per-language) | TS: `enum ShipmentStatus { Pending, InTransit, Delivered }`; Python: `class ShipmentStatus(str, Enum): PENDING = "pending"` | mixed casing within one enum |
| Constants | `SCREAMING_SNAKE_CASE` for true constants | `MAX_LOAD_WEIGHT_LBS`, `DEFAULT_PAGE_SIZE` | `maxWeight`, `Max_Load_Weight` |
| Files (components) | Match the component/export name | `LoadCard.tsx` exports `LoadCard` | `load-card.tsx` exporting `LoadCard`, `index.tsx` everywhere |
| Files (non-component TS) | `kebab-case` | `load-search.service.ts`, `api-client.ts` | `LoadSearchService.ts`, `apiClient.ts` |
| Files (Python) | `snake_case` | `shipment_repository.py` | `ShipmentRepository.py` |
| Folders | `kebab-case` | `load-board/`, `carrier-onboarding/` | `loadBoard/`, `Load_Board/` |
| API routes | plural nouns, `kebab-case` segments, `snake_case`/`kebab-case` never mixed | `/api/v1/shipments`, `/api/v1/load-board/search` | `/api/v1/getShipments`, `/api/v1/Shipment` |
| DB tables | `snake_case`, plural | `shipments`, `carrier_documents` | `Shipment`, `carrierDocument` |
| DB columns | `snake_case` | `created_at`, `carrier_id` | `createdAt`, `CarrierID` |
| Migrations | timestamp/seq + verb + description | `2026_07_05_1200_add_carrier_insurance_status.py` (Alembic auto-generates the hash prefix — keep the slug descriptive) | `migration3.py`, `fix.py` |

### 3.1 Examples in context

```typescript
// ✅ Correct — intent-revealing, typed, no abbreviation
function calculateEstimatedDeliveryDate(pickupDate: Date, distanceMiles: number): Date { ... }

interface CreateShipmentRequest {
  originAddress: Address;
  destinationAddress: Address;
  weightLbs: number;
  requestedPickupDate: string; // ISO 8601
}

// ❌ Incorrect — ambiguous, abbreviated, implementation-named
function calc(pd: Date, d: number): Date { ... }

interface ShipmentReqDTO {
  o: Address;
  d: Address;
  w: number;
}
```

```python
# ✅ Correct
class QuoteService:
    async def calculate_quote_for_load(self, load: Load, carrier: Carrier) -> Quote: ...

# ❌ Incorrect — vague noun, no verb, unclear what it returns
class QuoteHelper:
    async def process(self, l, c): ...
```

### 3.2 Naming rules that apply everywhere

- No Hungarian notation (`strName`, `arrItems`).
- No numeric suffixes to disambiguate (`getUser2`, `dataNew`) — rename or refactor instead.
- No single-letter variables except conventional loop indices (`i`, `j`) and math contexts. Never
  `l` (looks like `1`), never `O` (looks like `0`).
- Abbreviations are allowed only for universally understood terms: `id`, `url`, `api`, `db`, `ui`.
  Domain abbreviations (`qty`, `amt`) are banned — spell them out (`quantity`, `amount`).
- Negative booleans are banned: `isNotDelivered` forces double negatives at call sites
  (`if (!isNotDelivered)`). Use `isDelivered` and negate at the call site if needed.

---

## 4. Code Style

### 4.1 Formatting

- Formatting is enforced by tooling, never by hand: **Prettier** (frontend, via `eslint-config-next`)
  and **Ruff format** (backend). If the formatter and your instinct disagree, the formatter wins —
  do not hand-tune around it.
- Run formatters on save / pre-commit, not as a manual "fix at the end" step. A PR with unrelated
  formatting churn is a review-blocking smell (see [§13](#13-git-workflow)).
- 2-space indent for TS/TSX/JSON/YAML, 4-space for Python (PEP 8 default, matches Ruff/Black default).

### 4.2 Comments

- Default to **no comments**. Well-named code documents the "what."
- Write a comment only for the "why" that isn't derivable from reading the code: a regulatory
  constraint, a non-obvious workaround for a library bug, a subtle invariant a future editor could
  break without realizing.
- Never write a comment that restates the code:

```typescript
// ❌ Incorrect — restates the line, adds nothing
// increment the retry count
retryCount += 1;

// ✅ Correct — explains a non-obvious constraint
// DOT regulations require carrier insurance re-verification every 90 days;
// this is not configurable per carrier, see 49 CFR 387.7.
const INSURANCE_REVERIFICATION_DAYS = 90;
```

- Never leave commented-out code. Delete it — git history preserves it.
- Docstrings (Python) are required on every public service/repository method (see [§14.5](#145-docstrings));
  not required on private helpers whose name is self-explanatory.
- No TODO comments without an owner and a tracked issue: `# TODO(alyssa): handle partial refunds — JIRA-482`.
  A bare `// TODO: fix this` is not acceptable — it has no accountability and never gets fixed.

### 4.3 Whitespace

- One blank line between logical steps inside a function; no more than one consecutive blank line
  anywhere.
- No trailing whitespace, files end with exactly one newline (enforced by formatter/EditorConfig).
- Group related declarations without blank lines between them; separate unrelated groups with one.

### 4.4 Imports

Order, top to bottom, one blank line between groups (frontend, enforced by `eslint-plugin-import` /
`simple-import-sort`; backend, enforced by Ruff's `isort` rules):

1. External packages (`react`, `next`, `fastapi`, `sqlalchemy`)
2. Internal absolute imports (`@/lib/...`, `@/features/...` or `app.core...`, `app.domain...`)
3. Relative imports (`./LoadCard`, `.repository`)
4. Type-only imports last within their group (`import type { Load } from './types'`)

```typescript
// ✅ Correct
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';
import { LoadCard } from '@/features/load-board/components/LoadCard';

import { formatCurrency } from './utils';

import type { Load } from './types';
```

- No wildcard imports (`import * as React from 'react'` is the one framework-mandated exception).
  `from module import *` in Python is banned outright — always import explicit names.
- No deep-reaching into another feature's internals (`import { LoadCardSkeleton } from
  '@/features/load-board/components/LoadCard'` from outside that feature) — import from the
  feature's public `index.ts` only.
- Absolute imports (`@/...`) for anything outside the current feature folder; relative imports only
  within the same feature/module.

### 4.5 Export rules

- Prefer **named exports** over default exports everywhere, including React components and Next.js
  pages/layouts where the framework requires a default export (route files are the *only* exception,
  because Next.js requires `export default` for `page.tsx`/`layout.tsx`).
- Rationale: named exports are refactor-safe (renaming updates all call sites via the IDE), are
  greppable, and prevent the "same component, five different import names across the codebase"
  problem default exports invite.

```typescript
// ✅ Correct
export function LoadCard({ load }: LoadCardProps) { ... }

// ❌ Incorrect (outside of Next.js route files)
export default function LoadCard({ load }: LoadCardProps) { ... }
```

- No barrel files that re-export an entire folder's internals (`export * from './components'`)
  beyond a feature's single public `index.ts`. Deep barrels defeat tree-shaking and create circular
  import risk.

### 4.6 File organization

Within a file, order top to bottom: imports → types/interfaces → constants → the main
export(s) → private helper functions used only in this file → (rare) default export for route files.
One React component per file (matching the file name); co-locate its own tiny sub-components only if
they are never used elsewhere and are under ~15 lines.

### 4.7 Maximum function size

- **40 lines** is the soft limit for a function body (excluding signature and closing brace). Past
  that, extract named sub-steps. This is enforced by ESLint (`max-lines-per-function`) at 40 with a
  warning and a hard review-blocking convention at 80.
- A function should do one thing at one level of abstraction. If you find yourself writing a comment
  to label a section (`// build the query`, `// validate input`), that section is a function.

### 4.8 Maximum file size

- **300 lines** is the soft limit per file (excluding tests, generated code, and config). Past 400,
  split by responsibility. A 900-line `page.tsx` is a sign the feature needs decomposition into
  components/hooks, not a sign the feature is "just big."

### 4.9 Cyclomatic complexity

- Max cyclomatic complexity of **10** per function, enforced by ESLint (`complexity`) and Ruff/
  `mccabe` on the backend. Nested conditionals past 2 levels should be flattened with early returns
  (guard clauses) instead of `if/else` pyramids.

```typescript
// ❌ Incorrect — nested pyramid, complexity climbs fast
function canBookLoad(load: Load, carrier: Carrier): boolean {
  if (load.status === 'open') {
    if (carrier.isVerified) {
      if (carrier.insuranceExpiresAt > new Date()) {
        return true;
      }
    }
  }
  return false;
}

// ✅ Correct — guard clauses, flat, each condition reads as a rule
function canBookLoad(load: Load, carrier: Carrier): boolean {
  if (load.status !== 'open') return false;
  if (!carrier.isVerified) return false;
  if (carrier.insuranceExpiresAt <= new Date()) return false;
  return true;
}
```

### 4.10 Code readability rules

- Prefer explicit `if/else` or early returns over nested ternaries. One ternary is fine; two nested
  is a violation.
- No magic numbers/strings — name them as constants (`MAX_LOAD_WEIGHT_LBS`, not a bare `80000`
  appearing three times).
- Avoid boolean parameters that change function behavior ambiguously
  (`createShipment(data, true)` — true for what?). Use an options object with named keys, or split
  into two named functions.
- Prefer pure functions where possible; isolate side effects (DB calls, API calls, mutation) at the
  edges of a module, not scattered through pure business logic.

---

## 5. Architecture Rules

### 5.1 Clean Architecture

Dependencies point inward, toward domain logic; domain logic never imports framework or
infrastructure code.

```
   ┌─────────────────────────────────────────┐
   │  API layer (routers, controllers)        │  ← knows about HTTP
   │  ┌─────────────────────────────────────┐ │
   │  │  Service layer (domain logic)        │ │  ← knows about business rules
   │  │  ┌─────────────────────────────────┐ │ │
   │  │  │  Repository layer (data access)  │ │ │  ← knows about the DB
   │  │  └─────────────────────────────────┘ │ │
   │  └─────────────────────────────────────┘ │
   └─────────────────────────────────────────┘
```

- Routers depend on services. Services depend on repository *interfaces* (or, pragmatically in a
  Python codebase without a DI container, on repository classes injected via FastAPI `Depends`).
  Repositories depend on the ORM/DB session.
- A service must never import `fastapi` (no `Request`, `Response`, `HTTPException` inside
  `domain/`). If a service needs to signal an error, it raises a domain exception (see
  [§16.1](#161-backend-exceptions)); translating that into an HTTP status code is the router's job.
- A repository must never contain business logic (no rate calculation, no authorization checks) —
  only queries and persistence.

### 5.2 SOLID

- **S**ingle Responsibility: `QuoteService` calculates quotes; it does not also send notification
  emails. That's `NotificationService`, called by whichever orchestrator needs both.
- **O**pen/Closed: adding a new load type (e.g., "reefer" vs "dry van") should extend via a new
  strategy/handler, not require editing a giant `if load.type == 'dry_van': ... elif ...` in ten
  places. Use a registry/strategy pattern once you have 3+ branches on the same discriminant.
- **L**iskov Substitution: a `PostgresShipmentRepository` and an `InMemoryShipmentRepository` (for
  tests) must be fully interchangeable behind the same interface — no test-only repo may throw on a
  method the real one supports.
- **I**nterface Segregation: don't force a `ReadOnlyShipmentView` to depend on a repository interface
  that includes `delete()`. Split read and write interfaces when consumers genuinely only need one.
- **D**ependency Inversion: services depend on abstractions (repository protocols/interfaces), and
  concrete implementations are wired at the composition root (FastAPI's `Depends` graph, or a
  `providers.py`), not constructed ad hoc inside business logic.

### 5.3 DRY

- Duplicate business logic (e.g., quote pricing math) must live in exactly one place. Duplicate
  *incidental* similarity (two components that happen to both render a card shape today but for
  unrelated domains) is not a DRY violation — do not force an abstraction over coincidence. See the
  "rule of three": extract a shared abstraction on the third occurrence, not the second, unless the
  first two are truly the same concept.

### 5.4 KISS

- Choose the simplest design that satisfies today's actual requirements. A generic plugin/strategy
  registry for a feature with two variants is over-engineering — a `switch`/`match` is simpler and
  just as correct until a third variant justifies the registry.

### 5.5 YAGNI

- Do not build configurability, extensibility, or abstraction for requirements that have not been
  requested. No "just in case" parameters, no unused feature flags, no repository methods with no
  caller. If it isn't used, it isn't merged.

### 5.6 Composition over inheritance

- Prefer composing small functions/hooks/services over deep class inheritance hierarchies. React:
  compose components and hooks, do not build class-component inheritance chains. Python: prefer
  composition and Protocols over deep `class A(B, C, D)` trees; inheritance is acceptable for a
  shallow (1-level) shared-base case like a common `Repository` base class implementing generic CRUD.

### 5.7 Dependency Injection

- Frontend: dependencies (API client, feature flags) are passed via React context/providers or
  hook parameters — never imported as a mutable singleton reached into from deep inside a component
  tree, which makes testing and SSR correctness harder.
- Backend: use FastAPI's `Depends()` system as the DI container. Services and repositories are
  constructed via `Depends`, not instantiated directly inside route handlers or inside each other.

```python
# ✅ Correct — dependencies injected, testable in isolation
def get_shipment_repository(session: AsyncSession = Depends(get_db_session)) -> ShipmentRepository:
    return ShipmentRepository(session)

def get_shipment_service(
    repo: ShipmentRepository = Depends(get_shipment_repository),
) -> ShipmentService:
    return ShipmentService(repo)

@router.post("/shipments", response_model=ShipmentResponse, status_code=status.HTTP_201_CREATED)
async def create_shipment(
    payload: CreateShipmentRequest,
    service: ShipmentService = Depends(get_shipment_service),
    current_user: User = Depends(get_current_user),
) -> ShipmentResponse:
    shipment = await service.create_shipment(payload, created_by=current_user)
    return ShipmentResponse.model_validate(shipment)
```

```python
# ❌ Incorrect — service reaches out and constructs its own dependency, untestable without a real DB
class ShipmentService:
    async def create_shipment(self, payload):
        repo = ShipmentRepository(get_global_session())  # hidden dependency, can't be mocked
        ...
```

### 5.8 Repository Pattern

- Every SQLAlchemy model that is queried from more than one place gets a repository class:
  `ShipmentRepository`, `CarrierRepository`. The repository owns all queries for that aggregate root.
- Repositories return domain/ORM objects, never raw dicts or raw SQL rows, and never leak
  `sqlalchemy.Select` objects to callers — the query is fully executed inside the repository method.
- Do not create a repository for a model that is only ever fetched as part of another aggregate
  (e.g., a `LoadDocument` always fetched via its parent `Load`) — that's over-abstraction; access it
  through the parent repository/relationship instead.

### 5.9 Service Layer

- All business logic (pricing rules, booking eligibility, status transitions) lives in a service,
  never in the router and never in the repository. The router's job is: parse/validate request →
  call one service method → map result to response schema. Nothing else.
- A service method should read as a description of a business operation: `book_load_for_carrier`,
  `calculate_quote`, `cancel_shipment_with_refund` — not `update_records` or `process`.

### 5.10 Domain-Driven Design concepts (where appropriate)

Full DDD tactical patterns (aggregates, value objects, domain events) are not mandated for every
CRUD resource — that would violate YAGNI/KISS for simple entities. Apply them where the domain
complexity justifies it:

- **Aggregate roots**: `Shipment` is an aggregate root; `ShipmentStatusHistory` entries are only ever
  modified through the `Shipment` aggregate, never updated directly.
- **Value objects**: `Money` (amount + currency), `Address`, `WeightLbs` are value objects — immutable,
  compared by value, and validated at construction (e.g., `Money` rejects negative amounts). Do not
  pass raw `float` around for currency; floating point money is a bug generator (see
  [§8.9](#89-data-types--money)).
- **Domain events**: significant state transitions (`ShipmentBooked`, `LoadCancelled`) that trigger
  side effects (notifications, invoicing) should be modeled as explicit events dispatched from the
  service layer, not as ad hoc side-effect calls buried inside an unrelated method.

### 5.11 Anti-patterns to avoid

- **God objects**: a `ShipmentManager` that handles pricing, notifications, PDF generation, and
  status transitions. Split by responsibility.
- **Anemic services with fat routers**: business logic inline in the route handler. If a router
  function is more than ~15 lines or contains an `if`/business rule, that logic belongs in a service.
- **Fat models**: SQLAlchemy models with business logic methods that require calling other services
  (models may have simple derived properties, not methods that hit the network or other tables).
- **Shotgun surgery risk from copy-pasted validation**: the same "is this carrier eligible" check
  reimplemented in three routers. Extract to one service method.
- **Premature microservices/queues**: do not introduce a message queue, a second service, or an event
  bus for a feature that a direct service call handles fine today. Justify infrastructure additions
  with an ADR (see [§14.4](#144-decision-records)).
- **Singleton mutable global state** on either side of the stack (a module-level mutable cache, a
  global "current user" variable). Breaks testability and concurrency correctness.
- **Leaky abstractions**: a repository method that accepts a raw SQL string or exposes SQLAlchemy
  internals through its return type/signature.

---

## 6. Frontend Standards

### 6.1 Next.js App Router conventions

- Route segments live under `app/`, following Next.js file conventions exactly: `page.tsx`,
  `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts` for route handlers.
- Route groups `(group-name)` for organization without affecting the URL (e.g.,
  `app/(marketing)/page.tsx` vs `app/(dashboard)/loads/page.tsx`).
- Dynamic segments: `[id]` for a single required param, `[...slug]` for catch-all — used sparingly
  and only when the URL structure genuinely needs it (`app/loads/[loadId]/page.tsx`).
- Colocate route-only components inside a private `_components/` folder under the route segment
  (the leading underscore opts it out of routing); promote to `components/` or the feature folder
  only once reused.

### 6.2 Server Components vs Client Components

- **Default to Server Components.** Add `'use client'` only when a component genuinely needs
  interactivity (event handlers, state, effects, browser-only APIs) or a client-only library.
- Push `'use client'` as far down the tree ("leaf-ward") as possible — a client boundary at the top
  of a page forces its entire subtree into the client bundle even if only one small piece needs
  interactivity.

```tsx
// ✅ Correct — server component fetches data, delegates the one interactive bit to a small client leaf
// app/loads/[loadId]/page.tsx  (Server Component, no 'use client')
export default async function LoadPage({ params }: { params: { loadId: string } }) {
  const load = await getLoad(params.loadId); // direct server-side data fetch
  return (
    <div>
      <LoadSummary load={load} />
      <BookLoadButton loadId={load.id} /> {/* only this is a client component */}
    </div>
  );
}
```

```tsx
// ❌ Incorrect — whole page marked client just because one button needs onClick
'use client';
export default function LoadPage({ load }: { load: Load }) {
  const [booking, setBooking] = useState(false);
  return <div>{/* entire static summary now ships as client JS unnecessarily */}</div>;
}
```

- Server Components fetch data directly (`await` in the component, or via server-only data
  functions) — do not fetch through a client-side `useEffect` for data that's known at render time.
- Never import server-only modules (DB clients, secrets) into a file that will be imported by a
  Client Component — mark server-only modules with the `server-only` package to get a build-time
  error if this happens.

### 6.3 Suspense

- Wrap slow/streamed data fetches in `<Suspense>` with a purposeful fallback (a skeleton matching
  the real layout), not a generic spinner, to avoid layout shift.
- Use Suspense boundaries to isolate slow parts of a page (e.g., a carrier's rating history) from
  fast parts (the carrier's name/header) so the fast parts render immediately.

### 6.4 Caching & Data Fetching

- Understand and be explicit about Next.js fetch caching semantics for this version — do not assume
  defaults from older Next.js versions; **read `node_modules/next/dist/docs/` for this installed
  version before relying on caching behavior**, per the root `AGENTS.md` warning already imported at
  the top of this file. This is not optional — caching defaults are exactly the kind of breaking
  change that warning exists for.
- Be explicit about cache intent on every server fetch rather than relying on implicit defaults:
  tag/revalidate strategy for data that changes (`loads` listings) vs. long-lived cache for data that
  doesn't (static reference data like equipment types).
- Mutations (booking a load, submitting a quote) must invalidate/revalidate the specific cached data
  they affect, not the entire route tree.

### 6.5 React Query (TanStack Query)

- Used for all **client-side** data fetching/mutation state (loading/error/optimistic updates) —
  Server Components handle server-side fetching; React Query is for client components that need to
  refetch, poll, or mutate interactively (e.g., a live load-board search with filters).
- One custom hook per query/mutation, named `use<Noun><Verb?>`: `useLoadSearch(filters)`,
  `useBookLoadMutation()`. Do not call `useQuery`/`useMutation` directly inside a component body —
  wrap it so the query key and fetcher are defined once and reused.
- Query keys are structured arrays, not strings: `['loads', 'search', filters]`, so invalidation can
  target precisely (`invalidateQueries({ queryKey: ['loads'] })` invalidates all load queries).
- Always handle `isPending`/`isError` states explicitly in the UI — never render as if data is
  present without checking.

### 6.6 Tailwind CSS

- Utility classes are the default styling mechanism. Do not hand-write CSS files/CSS-in-JS for
  things Tailwind already expresses, to keep one styling system in the codebase.
- Extract a component (not a `@apply` CSS class) when a utility combination repeats 3+ times —
  `<Button>` as a React component, not a `.btn` class. This keeps styling colocated with markup and
  keeps Tailwind's tree-shaking/purging simple.
- Use the design tokens defined in `tailwind.config`/`globals.css` (spacing, color, radius scale) —
  no arbitrary magic-number values (`mt-[13px]`) except for genuinely one-off alignment fixes, and
  even then prefer adjusting the design token if it recurs.
- Responsive and dark-mode variants are expressed with Tailwind's built-in modifiers
  (`sm:`, `dark:`) — do not hand-roll media queries.

### 6.7 Accessibility

- Every interactive element is a real semantic element (`<button>`, `<a>`) — never a `<div
  onClick>`. If a custom-styled clickable element is needed, style the real element; do not fake it.
- All images have meaningful `alt` text (or `alt=""` if purely decorative — never omitted).
- All form inputs have an associated `<label>` (visually hidden via `sr-only` if the design omits a
  visible label — never a bare placeholder as the only label).
- Color is never the only signal for state (e.g., a red border alone for a validation error) — pair
  with an icon and/or text.
- Keyboard navigation must work for every interactive flow (tab order, focus visible, `Escape` closes
  modals, focus trap inside modals/dialogs).
- Target WCAG 2.1 AA as the minimum bar for contrast ratios and interactive target sizes.

### 6.8 SEO

- Use the Next.js Metadata API (`generateMetadata`/static `metadata` export) per route — never
  hand-roll `<head>` tags in a component body.
- Public marketing/listing pages (e.g., a public load board listing) must render meaningful content
  server-side (Server Components handle this by default) — do not rely on client-side rendering for
  content that needs to be indexed.
- Semantic HTML structure (one `<h1>` per page, logical heading order) is an SEO and accessibility
  requirement simultaneously.

### 6.9 Performance

- Use `next/image` for all raster images — never a bare `<img>` — to get automatic sizing/format/lazy
  loading.
- Use `next/font` for web fonts (already set up in this project) to avoid layout shift and
  extra render-blocking requests.
- Code-split heavy, rarely-used client components (a rich map view, a PDF viewer) via `next/dynamic`
  rather than including them in the initial bundle for every page.
- Memoize expensive client-side computations (`useMemo`) and stable callbacks passed to memoized
  children (`useCallback`) — but do not reflexively wrap everything; only where a profiler shows a
  real re-render cost.

### 6.10 Error Boundaries

- Every route segment that can fail independently gets its own `error.tsx` boundary so one feature's
  failure doesn't blank the whole page.
- Error boundary UI must be actionable for the user (a retry button, a link back to the load board),
  not a bare stack trace. Never render raw error messages/stack traces to end users in production —
  log the detail server-side (see [§15](#15-logging-standards)) and show a friendly message with a
  correlation ID the user can quote to support.

### 6.11 Loading states

- Every async boundary has a purposeful loading state: route-level `loading.tsx` for navigation, a
  skeleton matching final content shape for in-place refetches (React Query `isPending`), never a
  layout-shifting bare spinner where a skeleton is feasible.
- Optimistic updates (e.g., "Book Load" button) show the expected end state immediately and roll
  back with a visible error toast on failure — the user should never wonder if their click registered.

### 6.12 Forms

- Use `react-hook-form` (or the team-approved equivalent — do not introduce a second form library
  once one is adopted) for any form beyond a single input, for performance (uncontrolled inputs) and
  built-in validation wiring.
- Client-side validation is a UX convenience; **server-side validation is the actual security/
  correctness boundary** and must independently re-validate everything (see [§7.4](#74-validation)
  and [§10.7](#107-input-validation)). Never trust that client validation ran.
- Disable the submit button (or show a pending state) during submission to prevent double-submits —
  critical for anything that creates a financial record (a booking, an invoice).

### 6.13 Validation (frontend schemas)

- Use `zod` (or the team-approved schema library) to define form/input schemas, and derive
  TypeScript types from the schema (`z.infer<typeof schema>`) rather than maintaining a parallel
  hand-written interface that can drift from the validation rules.

### 6.14 State management

- Prefer the least powerful tool that solves the problem, in this order: (1) local component state
  (`useState`), (2) lifted state to the nearest common ancestor, (3) React Query for server state,
  (4) React Context for narrow, low-frequency-update global concerns (auth session, theme), (5) a
  dedicated client state library only when 1-4 are demonstrably insufficient (justify in the PR).
- **Never** put server data (a fetched `Load`, a `Carrier` list) into a global client state store —
  that's React Query's job, including its cache. Global state is for genuinely client-only state
  (UI preferences, in-progress multi-step form data before submission).
- Do not lift state higher than its actual consumers require "just in case" — this causes unrelated
  re-renders and violates YAGNI.

### 6.15 Folder structure (frontend specifics)

See [§2.4](#24-feature-first-vs-layer-first). Additional rule: a feature's `api.ts` is the only file
in that feature allowed to call `apiClient` directly — components call feature hooks, hooks call
`api.ts` functions, `api.ts` calls the shared `apiClient`. This keeps the HTTP contract in one place
per feature and makes it easy to see everything a feature sends/receives from the backend.

### 6.16 Reusable components, composition, and when to split

- A component should be split when: it exceeds ~150 lines, it mixes two unrelated concerns (data
  fetching + presentation — split into a container/hook + a presentational component), or a sub-tree
  within it is reused elsewhere.
- Favor composition (children/render props/slots) over configuration explosion — a `<Card>` that
  accepts `children` and named slots (`<Card.Header>`, `<Card.Body>`) beats a `<Card
  showHeader showFooter headerVariant="..." />` with a dozen boolean/enum props.
- Presentational components take data and callbacks as props and contain no data-fetching; container
  components/hooks own data-fetching and pass data down. This split is what makes presentational
  components trivially reusable and testable with Storybook/unit tests without a network mock.

---

## 7. Backend Standards

### 7.1 FastAPI architecture

Layering is Router → Service → Repository → Model, per [§5.1](#51-clean-architecture). Concretely:

```
server/app/
├── api/
│   ├── deps.py              # shared Depends() providers (db session, current user)
│   └── v1/
│       ├── shipments.py     # APIRouter for /api/v1/shipments
│       └── carriers.py
├── core/
│   ├── config.py            # Settings (pydantic-settings), env-driven
│   ├── security.py          # password hashing, JWT
│   └── logging.py
├── domain/
│   └── shipments/
│       ├── service.py        # ShipmentService — business logic
│       └── exceptions.py     # domain-specific exceptions
├── models/
│   └── shipment.py           # SQLAlchemy ORM model
├── repositories/
│   └── shipment_repository.py
├── schemas/
│   └── shipment.py            # Pydantic request/response models
└── main.py                    # FastAPI() app, router registration, middleware
```

### 7.2 Routing

- One `APIRouter` per resource, registered under a versioned prefix in `main.py`
  (`app.include_router(shipments.router, prefix="/api/v1")`).
- Route handlers are thin: parse/validate (Pydantic does this automatically), call one service
  method, return a response schema. No business logic, no direct DB session usage in a handler.
- Every route declares `response_model`, an explicit `status_code`, and a `summary`/`tags` for
  OpenAPI (see [§9.11](#911-openapi)).

### 7.3 Dependency Injection

Covered in depth in [§5.7](#57-dependency-injection). Additional rule: shared dependencies
(`get_db_session`, `get_current_user`) live in `api/deps.py` and are imported by every router — never
redefined per-router.

### 7.4 Validation

- All request bodies, query params, and path params are typed Pydantic models/annotated types —
  never `dict` or untyped `Request.json()` parsing.
- Validation rules that are business rules (not just shape — e.g., "pickup date must be in the
  future") belong in Pydantic validators (`field_validator`/`model_validator`) when they only need
  the payload itself, or in the service layer when they need to check against the database (e.g.,
  "carrier must be verified") — Pydantic validators must never make DB calls.

```python
from pydantic import BaseModel, field_validator
from datetime import date

class CreateShipmentRequest(BaseModel):
    origin_zip: str
    destination_zip: str
    weight_lbs: float
    requested_pickup_date: date

    @field_validator("requested_pickup_date")
    @classmethod
    def pickup_date_must_be_future(cls, v: date) -> date:
        if v <= date.today():
            raise ValueError("requested_pickup_date must be in the future")
        return v

    @field_validator("weight_lbs")
    @classmethod
    def weight_must_be_positive_and_within_limit(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("weight_lbs must be positive")
        if v > 80_000:
            raise ValueError("weight_lbs exceeds legal road limit of 80,000 lbs")
        return v
```

### 7.5 Schemas (Pydantic)

- Separate schemas per direction and purpose: `CreateShipmentRequest`, `UpdateShipmentRequest`
  (fields optional), `ShipmentResponse`. Never reuse a single schema for both request and response —
  they have different required-field semantics and a response schema often includes server-generated
  fields (`id`, `created_at`) a request must not accept.
- Never expose the SQLAlchemy model directly as a response — always map through a `Response` schema
  (`ShipmentResponse.model_validate(shipment_orm_obj)`, with `model_config =
  ConfigDict(from_attributes=True)`), so internal columns (e.g., a soft-delete flag, an internal
  pricing cost basis the carrier shouldn't see) are never leaked by accident.
- Use `Field(...)` descriptions on every schema field — they flow straight into OpenAPI docs.

### 7.6 Authentication

- JWT-based auth (access + refresh token pair) — see full detail in [§10.2](#102-jwt) and
  [§10.3](#103-refresh-tokens).
- `get_current_user` is a FastAPI dependency that decodes/validates the access token and loads the
  user; it is the *only* place token validation happens. No router hand-rolls its own token check.
- Public vs authenticated routes are explicit: authenticated routers include `Depends(get_current_user)`
  at the router level (`APIRouter(dependencies=[Depends(get_current_user)])`) rather than repeating
  it on every individual route function.

### 7.7 Authorization

- Authorization (can *this* user act on *this* resource) is checked in the service layer, not the
  router and not the repository — e.g., `ShipmentService.cancel_shipment` checks that
  `current_user` is the shipment's owner or an admin before performing the cancellation, and raises a
  domain `ForbiddenError` otherwise.
- Prefer role/policy checks expressed as named predicates (`user_can_manage_shipment(user, shipment)`)
  over inline boolean expressions scattered across services, so the rule is defined once and testable
  in isolation.
- Never rely on the frontend hiding a button as the authorization mechanism — every privileged
  backend action independently re-checks authorization server-side.

### 7.8 Configuration

- All configuration is a single `Settings` class (`pydantic-settings`, `BaseSettings`) in
  `core/config.py`, populated from environment variables, instantiated once
  (`@lru_cache def get_settings()`), and injected via `Depends` where needed — never
  `os.environ.get(...)` scattered through the codebase.
- Settings are typed and validated at startup — a missing required env var must fail fast at process
  boot, not at first use three requests later.

### 7.9 Logging

Full standard in [§15](#15-logging-standards). Backend-specific: use the standard `logging` module
configured for structured (JSON in production, human-readable in dev) output, obtained via
`logging.getLogger(__name__)` per module — never `print()`.

### 7.10 Database sessions

- One `AsyncSession` per request, provided via a `Depends(get_db_session)` generator that guarantees
  the session is closed (and rolled back on exception) at request end.
- Never share a session across concurrent requests/background tasks. Never store a session on a
  module-level global.
- Repositories receive the session via constructor injection; they do not open their own sessions.

### 7.11 Transactions

- A single logical business operation (e.g., "book a load," which updates the load status, creates a
  booking record, and decrements available capacity) executes inside one transaction — commit once,
  at the service-layer boundary (or via a `Depends` that commits after a successful response), not
  once per repository call.
- On any exception inside the operation, the transaction rolls back fully — never leave partial
  writes (e.g., a `Booking` row created but the `Load` status left as `open`).
- Use explicit `async with session.begin():` (or the FastAPI middleware/dependency equivalent) rather
  than relying on autocommit-style implicit transactions.

### 7.12 Async programming

- The entire backend request path is `async def` — routers, services, repositories. Never call a
  blocking/synchronous DB driver or blocking I/O (`requests`, `time.sleep`, synchronous file I/O)
  inside an async function; it blocks the whole event loop for every concurrent request. Use `httpx`
  (async) instead of `requests`, `asyncio.sleep` instead of `time.sleep`, and the async SQLAlchemy
  driver (`asyncpg`).
- If a genuinely CPU-bound or blocking-library operation is unavoidable, run it in a thread pool via
  `asyncio.to_thread` / `run_in_executor` rather than blocking the loop directly.
- Do not use `asyncio.gather` to parallelize independent DB calls that share one session — sessions
  are not safe for concurrent use; parallelize independent I/O only when each call has its own
  session/connection.

### 7.13 Middleware

- Cross-cutting concerns (request ID injection, structured request/response logging, CORS,
  authentication token extraction) are middleware, not repeated per-route code.
- Order matters: CORS → request-ID/logging → error-handling → auth. Document the order in
  `main.py` with a comment if it's non-obvious, since middleware order bugs are notoriously subtle.
- Keep middleware fast and side-effect-light; heavy logic belongs in services, not middleware.

### 7.14 Error handling

Full standard in [§16](#16-error-handling). Summary: domain exceptions raised in services, caught by
a single set of FastAPI exception handlers (`@app.exception_handler(DomainError)`) registered once in
`main.py`, translated to a consistent error response shape (see [§9.6](#96-error-responses)). No
router should contain a bare `try/except` translating exceptions to HTTP codes — that's what the
global exception handlers are for.

---

## 8. Database Standards

### 8.1 Schema design

- Every table represents one clear domain concept. No "kitchen sink" tables with a `type` column
  branching into unrelated column sets — model distinct concepts (e.g., `Booking` vs `Quote`) as
  distinct tables even if they share some columns.
- Every table has a primary key, and (per [§8.5](#85-uuids)) that key is a UUID unless there is a
  measured, documented performance reason otherwise.

### 8.2 Normalization

- Design to at least 3NF by default: no repeating groups, every non-key column depends on the whole
  key, no transitive dependencies (e.g., don't store `carrier_name` on the `Load` table when
  `carrier_id` already gives you that via a join).
- Deliberate denormalization is allowed only as a documented, measured performance optimization
  (e.g., a materialized `current_load_count` on `Carrier` updated transactionally, to avoid a `COUNT`
  join on every load-board page render) — comment *why* at the column, and keep it in sync
  transactionally, never via a background job that can drift silently.

### 8.3 Indexes

- Every foreign key column gets an index (PostgreSQL does not create these automatically, unlike the
  PK).
- Every column used in a `WHERE`, `ORDER BY`, or `JOIN` on a table expected to grow beyond a few
  thousand rows gets an index — in this domain, that's `shipments.status`, `loads.origin_zip`,
  `loads.requested_pickup_date`, `bookings.carrier_id`, at minimum.
- Composite indexes match actual query patterns (leftmost-prefix rule) — e.g., an index on
  `(status, requested_pickup_date)` for "open loads sorted by pickup date," not two separate
  single-column indexes if the query always filters both.
- Add indexes in the same migration as the query that needs them, and justify non-obvious ones with a
  one-line comment referencing the query they serve.
- Do not over-index: every index adds write cost and storage. Do not add a "just in case" index for a
  column with no query using it yet (YAGNI applies to indexes too).

### 8.4 Relationships & Foreign Keys

- Every foreign key is declared with an explicit `ON DELETE` policy — never left to the default
  (which is `NO ACTION` in Postgres and will surprise someone). Choose deliberately:
  `ON DELETE RESTRICT` for records that must not be orphaned silently (a `Booking` referencing a
  `Load`), `ON DELETE CASCADE` only where child rows are genuinely meaningless without the parent and
  cascading deletion is the intended business behavior (rare — prefer soft deletes, see
  [§8.6](#86-soft-deletes)), `ON DELETE SET NULL` for optional references that should survive.
- Many-to-many relationships use an explicit join table with its own name (`load_carrier_invites`,
  not an anonymous auto-generated association table) so it can carry its own columns (e.g., invited
  at, status) as the domain inevitably needs them.

### 8.5 UUIDs

- Primary keys are UUIDv7 (or UUIDv4 if v7 generation isn't available in the driver/version in use) —
  never auto-incrementing integers for anything exposed via the API, to avoid leaking record counts/
  enumeration attacks (see [§10.9](#109-owasp-recommendations)) and to allow client-generated IDs for
  idempotent creates (see [§9.9](#99-idempotency)).
- Store as native `UUID` column type (`sqlalchemy.dialects.postgresql.UUID`), never as a `VARCHAR`.

### 8.6 Soft deletes

- User-facing, business-meaningful records that need an audit trail or "undo" (`Shipment`, `Load`,
  `Booking`, `Invoice`) use soft deletes: a nullable `deleted_at: datetime | None` column, never a
  hard `DELETE`. All repository read queries filter `deleted_at IS NULL` by default via a base
  repository method — never repeat that filter ad hoc in every query.
- Purely transient/derived data (e.g., a cached search-result row, a rate-limit counter) may use hard
  deletes — soft delete is not a universal default, it's for records with business/audit value.
- Unique constraints on soft-deletable tables must be partial indexes scoped to `WHERE deleted_at IS
  NULL`, or a re-created record after a soft delete will violate uniqueness against the deleted row.

### 8.7 Audit columns

- Every table has `created_at` and `updated_at` (`timestamptz`, server-default `now()`,
  `updated_at` maintained via an ORM `onupdate` or DB trigger — never left to the application to
  remember to set).
- Business-critical tables (`Shipment`, `Booking`, `Invoice`) additionally track `created_by_id` /
  `updated_by_id` referencing the acting user, for audit/compliance.
- Significant status transitions (a `Shipment` moving `pending → booked → in_transit → delivered`)
  are recorded in an append-only history table (`shipment_status_history`), not just overwritten on
  the parent row — the marketplace needs to answer "when was this booked" and "who cancelled this"
  after the fact, and an overwritten column can't answer that.

### 8.8 Migration strategy

- Alembic is the only way schema changes happen — never hand-edit the schema in a running database,
  never use `Base.metadata.create_all()` outside of ephemeral test databases.
- One migration per logical change, generated via `alembic revision --autogenerate` and then
  **hand-reviewed** — autogenerate misses data migrations, renames (it will drop+add a column
  instead of renaming, losing data if not corrected), and some constraint types.
- Every migration is reversible: implement `downgrade()` for real, don't leave it as `pass`, unless
  the change is fundamentally irreversible (e.g., dropping a column with data) — in which case say so
  in a comment.
- Backward-compatible migration steps for anything requiring zero-downtime deploys: adding a nullable
  column is safe in one step; adding a `NOT NULL` column on a large table requires (1) add nullable,
  (2) backfill, (3) add `NOT NULL` constraint, as separate migrations/deploys, so the old code
  version (still running during rollout) never sees a required column it doesn't write.
- Never edit a migration that has already been merged/deployed — write a new migration to correct it.
  Editing history breaks anyone who already applied it.

### 8.9 Data types & money

- Money is **never** `float`. Use `Numeric(precision, scale)` in Postgres (e.g., `Numeric(12, 2)` for
  USD amounts) mapped to Python `Decimal`, never `float`/`double precision` — floating point cannot
  represent currency exactly and will produce cent-level discrepancies at scale, which is
  unacceptable for invoices and carrier payouts.
- Store currency alongside every money amount (`amount: Numeric`, `currency: str` or an enum) rather
  than assuming USD everywhere, even if only USD is supported today — it's a one-column cost now
  versus a full data migration later.
- Timestamps are always `timestamptz` (timezone-aware), stored in UTC, converted to the user's
  timezone only at the presentation layer. Never store naive/local timestamps.

### 8.10 Performance optimization

- See [§11.2](#112-database-optimization) for query-level guidance. Schema-level: partition very
  large, time-ordered append-only tables (e.g., `shipment_status_history` once it reaches tens of
  millions of rows) by range on the timestamp, decided and implemented as a deliberate migration with
  a documented trigger threshold, not preemptively.

---

## 9. API Standards

### 9.1 REST conventions

- Resources are nouns, plural, `kebab-case` in multi-word paths: `GET /api/v1/shipments`,
  `POST /api/v1/load-board/searches`. Actions that don't map cleanly to CRUD use a sub-resource verb
  as a noun: `POST /api/v1/loads/{id}/bookings` (creating a booking), not `POST
  /api/v1/loads/{id}/book`.
- Standard verbs map to standard semantics: `GET` (read, no side effects, cacheable), `POST` (create,
  or a non-idempotent action), `PUT` (full replace, idempotent), `PATCH` (partial update), `DELETE`
  (remove/soft-delete, idempotent).

### 9.2 Versioning

- URL path versioning: `/api/v1/...`. All routes live under a version prefix from day one, even
  before a `v2` exists, so introducing one later never requires an unversioned-route migration.
- A breaking change (removing/renaming a field, changing a type, changing required-ness of a request
  field) requires a new version or an additive, backward-compatible alternative — never a silent
  breaking change to `v1` that active clients depend on.
- Additive changes (new optional field, new endpoint) do not require a version bump.

### 9.3 Pagination

- Every list endpoint is paginated by default — no endpoint may return an unbounded collection.
- Cursor-based pagination for anything that can grow large or is queried in real time (the load
  board): `?cursor=<opaque>&limit=50`, response includes `next_cursor: string | null`. Offset
  pagination (`?page=2&limit=50`) is acceptable only for small, rarely-changing admin lists where
  page-jumping UX matters more than consistency under concurrent writes.
- `limit` has a server-enforced maximum (e.g., 100) regardless of what the client requests, to
  prevent an accidental or malicious unbounded query.

### 9.4 Filtering

- Filters are explicit query parameters with documented allowed values, never a free-form query
  language passed straight into a `WHERE` clause: `GET /api/v1/loads?status=open&origin_state=TX`.
- Every filterable column must be indexed (see [§8.3](#83-indexes)) — do not expose a filter param
  for an unindexed column on a large table.

### 9.5 Sorting

- `?sort=requested_pickup_date&order=asc` (or a combined `?sort=-requested_pickup_date` convention —
  pick one and document it in the OpenAPI description). Only expose sorting on indexed columns.
- Always apply a deterministic tiebreaker (secondary sort on `id`) alongside any sort field used with
  cursor pagination, or pagination will produce duplicate/skipped rows when sort-field ties occur.

### 9.6 Error responses

Consistent shape across every endpoint, returned by the global exception handlers
(see [§16.1](#161-backend-exceptions)):

```json
{
  "error": {
    "code": "SHIPMENT_NOT_FOUND",
    "message": "Shipment 3f2a... was not found.",
    "details": {},
    "correlation_id": "9c6e2b1a-..."
  }
}
```

- `code` is a stable, machine-readable, `SCREAMING_SNAKE_CASE` string the frontend can switch on —
  never rely on parsing `message` text.
- `message` is human-readable and safe to display; it must never leak internals (stack traces, SQL,
  file paths — see [§10](#10-security-standards)).
- `correlation_id` matches the request's logging correlation ID (see [§15.3](#153-correlation-ids))
  so a user-reported error can be traced directly to server logs.

### 9.7 Status codes

| Code | Meaning | Use |
|---|---|---|
| 200 | OK | Successful `GET`/`PATCH`/`PUT` |
| 201 | Created | Successful `POST` that creates a resource; include `Location` header |
| 204 | No Content | Successful `DELETE` or action with no response body |
| 400 | Bad Request | Malformed request (unparseable body) |
| 401 | Unauthorized | Missing/invalid auth credentials |
| 403 | Forbidden | Authenticated but not permitted (see [§7.7](#77-authorization)) |
| 404 | Not Found | Resource doesn't exist, or exists but the user has no visibility (avoid leaking existence — see [§10.9](#109-owasp-recommendations)) |
| 409 | Conflict | State conflict (e.g., booking a load that was just booked by someone else) |
| 422 | Unprocessable Entity | Schema-valid but semantically invalid input (FastAPI's default for Pydantic validation errors) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unhandled exception — always logged with full detail server-side, never with detail exposed to the client |

Never invent non-standard codes or reuse 200 with an error payload — status codes are part of the
contract and clients (and infra like load balancers/monitoring) rely on them being accurate.

### 9.8 Rate limiting

- All public/authenticated endpoints are behind a rate limiter (per-user and per-IP), tuned per
  endpoint sensitivity — tighter limits on auth endpoints (login, password reset) and write-heavy
  endpoints (booking) than on read-heavy browsing.
- Return `429` with a `Retry-After` header, and include the limit in the standard error shape.

### 9.9 Idempotency

- All financially significant `POST` endpoints (booking a load, creating an invoice, processing a
  payout) accept an `Idempotency-Key` header; the server persists the key with the result and returns
  the original response on retry with the same key instead of double-executing. This is required
  because clients (mobile networks, flaky wifi at a truck stop) will retry.
- `PUT`/`DELETE` are naturally idempotent by HTTP semantics — ensure implementations actually satisfy
  that (a repeated `DELETE` returns `204`/`404` gracefully, not a `500`).

### 9.10 API documentation

- FastAPI's auto-generated OpenAPI docs (`/docs`, `/redoc`) are the canonical, always-up-to-date API
  reference — kept accurate by disciplined use of `response_model`, `Field(description=...)`, and
  docstrings on route functions (see [§9.11](#911-openapi)), not by a hand-maintained separate doc
  that will drift.
- Any endpoint behavior not expressible in the schema alone (e.g., rate limits, idempotency
  requirements) is documented in the route's docstring, which FastAPI surfaces in the generated docs.

### 9.11 OpenAPI

- Every route sets `response_model`, `status_code`, `summary`, and `tags` (grouped by resource).
- Request/response Pydantic models use `Field(..., description="...", examples=[...])` so generated
  docs are self-explanatory without cross-referencing code.
- Treat the generated OpenAPI schema as a contract test target: if a frontend codegen step consumes
  it (recommended once the backend exists — e.g., `openapi-typescript`), a schema change that breaks
  generation is caught in CI (see [§19](#19-cicd-standards)) before merge.

---

## 10. Security Standards

### 10.1 Authentication

- Every non-public endpoint requires a valid access token, enforced via the shared
  `get_current_user` dependency (see [§7.6](#76-authentication)) — never optional/best-effort auth
  on an endpoint that returns user-specific or sensitive data.
- Login endpoints must not reveal whether the failure was "user not found" vs. "wrong password" —
  return the same generic `401` message for both, to prevent user enumeration.

### 10.2 JWT

- Access tokens are short-lived (15 minutes), signed with a strong algorithm (`RS256` preferred over
  `HS256` so verification doesn't require distributing the signing secret to every verifier;
  `HS256` acceptable for a single-service monolith with the secret held only server-side).
- Tokens carry the minimum necessary claims (`sub`, `exp`, `iat`, a role/permission claim) — never
  put sensitive data (full PII, secrets) in the JWT payload, since it is base64-encoded, not
  encrypted, and readable by anyone holding the token.
- Always verify `exp` and signature server-side on every request — never trust an unverified decode.

### 10.3 Refresh tokens

- Refresh tokens are long-lived, stored server-side (hashed, like a password) so they can be revoked,
  and rotated on every use (issue a new refresh token, invalidate the old one) to limit the blast
  radius of a leaked token.
- Refresh tokens are delivered via `httpOnly`, `Secure`, `SameSite=Strict` (or `Lax` if a cross-site
  redirect flow requires it) cookies — never stored in `localStorage`, which is readable by any
  script and thus fully exposed to XSS.

### 10.4 Password hashing

- Passwords are hashed with `bcrypt` or `argon2id` (argon2id preferred for new code) with a
  work factor tuned to the current recommended cost — never MD5/SHA-1/SHA-256 alone (too fast,
  brute-forceable at scale) and never reversible encryption.
- Never log a password (hashed or plain) at any log level, ever — see [§15.7](#157-sensitive-information-rules).

### 10.5 Secrets management

- No secret (API keys, DB credentials, JWT signing keys, third-party tokens) is ever committed to
  the repository, in code, config files, or test fixtures — including in a "temporary" commit later
  removed; git history is forever.
- Secrets are injected via environment variables sourced from a secrets manager in every real
  environment (see [§17](#17-environment-management)); `.env.example` documents required variable
  *names* with placeholder values only, never real values.
- Rotate any secret immediately if it is ever exposed (committed, logged, pasted) — treat exposure as
  compromise, don't wait to confirm exploitation.

### 10.6 Input validation

Covered in depth in [§7.4](#74-validation). The security framing: **every** input from outside the
process boundary (request body, query params, headers, even values from a message queue or another
internal service) is untrusted until validated — including values a legitimate frontend "would never
send," because an attacker calls the API directly, not through your UI.

### 10.7 Output encoding

- React escapes interpolated values by default — never use `dangerouslySetInnerHTML` with anything
  other than content that has been through a trusted sanitizer (e.g., `DOMPurify`) immediately before
  the render, and only when rendering rich text is a genuine product requirement.
- API responses are always `application/json` with values properly serialized by Pydantic — never
  hand-built JSON strings via string concatenation, which risks injection.

### 10.8 OWASP recommendations

Treat the OWASP Top 10 as a minimum checklist for every PR touching auth, data access, or user
input, specifically:

- **Broken access control**: re-verify authorization server-side per [§7.7](#77-authorization) on
  every request; never rely on an ID being "hard to guess."
- **Cryptographic failures**: TLS everywhere (see [§10.13](#1013-https)), no home-rolled crypto.
- **Injection**: parameterized queries only (see [§10.9](#109-owasp-recommendations) below), no
  string-built SQL/shell commands from user input.
- **Insecure design**: threat-model financially significant flows (booking, payout) explicitly during
  design, not as an afterthought in review.
- **Security misconfiguration**: no debug mode, no verbose error pages, no default credentials in any
  deployed environment.
- **Vulnerable/outdated components**: dependencies scanned in CI (see [§19.4](#194-security-scanning)).
- **Identification/auth failures**: per [§10.1](#101-authentication)–[§10.4](#104-password-hashing).
- **Software/data integrity failures**: verify third-party package integrity (lockfiles committed and
  enforced, see [§17](#17-environment-management)); CI pipeline steps are pinned, not `@latest`.
- **Security logging/monitoring failures**: auth failures, authorization denials, and anomalous
  access patterns are logged (see [§15.6](#156-audit-logging)) and alertable.
- **SSRF**: any server-side fetch of a user-supplied URL (e.g., a webhook URL a carrier configures)
  validates against an allowlist/denies internal IP ranges before fetching.

### 10.9 SQL injection prevention

- All database access goes through SQLAlchemy's query builder/ORM with bound parameters — never
  string-formatted/concatenated SQL, including for "just this one admin script." If raw SQL is
  ever genuinely necessary, use `text()` with bound parameters (`text("... WHERE id = :id"), {"id":
  value}`), never an f-string/`.format()`/`%` substitution into SQL text.
- Also applies to sort/filter parameters: an `order_by` column name must be validated against an
  allowlist of real column names before being used dynamically — never interpolated directly, even
  via the ORM's dynamic attribute access, without validating it's a known-safe field first.

### 10.10 XSS prevention

- Rely on React's default escaping; treat any `dangerouslySetInnerHTML` usage as requiring security
  review and a sanitizer, per [§10.7](#107-output-encoding).
- Set a `Content-Security-Policy` header restricting script sources, as defense in depth beyond
  output encoding.

### 10.11 CSRF prevention

- Since auth uses `httpOnly` cookies for refresh tokens (§10.3), state-changing endpoints require
  either a `SameSite=Strict/Lax` cookie policy plus a custom header check (browsers won't
  auto-attach custom headers cross-site) or a synchronizer CSRF token for cookie-authenticated
  requests. If access tokens are sent via `Authorization: Bearer` header (not a cookie) for API
  calls, CSRF risk is inherently much lower since that header isn't auto-attached cross-site —
  document which model is in use once auth is implemented, and don't mix both ambiguously.

### 10.12 Secure cookies

- Every cookie carrying session/auth material: `Secure` (HTTPS only), `httpOnly` (no JS access),
  `SameSite=Strict` or `Lax`, minimal `Max-Age`/`Expires` matching the token's real lifetime, scoped
  `Path`/`Domain` as narrow as functionally possible.

### 10.13 HTTPS

- All environments beyond local dev serve exclusively over HTTPS/TLS 1.2+; HTTP requests are
  redirected, never served in parallel. `Strict-Transport-Security` header enabled in production.

### 10.14 CORS

- CORS allowlist is an explicit, minimal list of known frontend origins per environment — never
  `allow_origins=["*"]` combined with credentialed requests (cookies), which is both insecure and
  disallowed by browsers. Configure via `Settings` (§7.8) so the allowlist differs correctly per
  environment (§17.4).

---

## 11. Performance Standards

### 11.1 Caching

- Cache read-heavy, slow-changing data (e.g., reference data like equipment types, US state/zip
  lookups) at the appropriate layer — HTTP cache headers for public data, an in-process/Redis cache
  for computed values reused across requests.
- Cache keys and invalidation are explicit and owned by the code that writes the underlying data —
  never a cache with no clear invalidation story ("it'll expire eventually" is acceptable only for
  data where staleness up to the TTL is genuinely harmless).
- Never cache per-user authorization results across users, and never cache anything containing
  secrets/PII in a shared cache without encryption and scoping consideration.

### 11.2 Database optimization

- No N+1 queries: when fetching a list with related data (loads with their carrier), use SQLAlchemy
  eager loading (`selectinload`/`joinedload` chosen deliberately — `selectinload` for one-to-many to
  avoid row multiplication, `joinedload` for one-to-one/many-to-one) instead of triggering a query
  per row via lazy loading.
- Review the generated SQL (via SQLAlchemy's echo mode or a query logger) for any new list endpoint
  before merging — this is a required, not optional, review step (see [§21](#21-code-review-checklist)).
- Select only needed columns for large tables/hot paths rather than always loading full ORM entities,
  when the endpoint is read-only and performance-sensitive (e.g., a lightweight load-board search
  response doesn't need every column of the full `Load` model).

### 11.3 Query optimization

- Every query on a table expected to exceed a few thousand rows is checked against
  [§8.3 indexing rules](#83-indexes) before merge — run `EXPLAIN ANALYZE` on any new non-trivial
  query touching `loads`, `shipments`, or `bookings`.
- Push filtering/sorting/pagination to the database — never fetch a large result set into Python and
  filter/sort/paginate in application code.

### 11.4 Connection pooling

- The async engine is configured with an explicit pool size matched to expected concurrency and the
  database's max connection limit (`pool_size`, `max_overflow`) — never left at defaults without
  reviewing them against the deployment's real concurrency, and never a new engine/pool created per
  request.

### 11.5 Async operations

Covered in [§7.12](#712-async-programming). Additional: batch independent external calls (e.g.,
geocoding multiple addresses) concurrently via `asyncio.gather` when they don't share a DB session,
rather than sequentially awaiting each one.

### 11.6 Lazy loading (frontend)

- Route-level code splitting is automatic via the App Router; additionally lazy-load heavy,
  below-the-fold, or conditionally-rendered client components via `next/dynamic` (see
  [§6.9](#69-performance)).

### 11.7 Streaming

- Use React Server Component streaming (`<Suspense>`, per [§6.3](#63-suspense)) for pages with
  independently slow data dependencies, so fast content paints immediately rather than the whole page
  waiting on the slowest fetch.
- For backend endpoints returning large payloads (e.g., a CSV export of shipment history), use a
  streaming response (`StreamingResponse`) rather than building the entire payload in memory first.

### 11.8 Compression

- Enable gzip/Brotli compression at the edge/reverse-proxy or via ASGI middleware for API responses
  and static assets — verify it's actually active in each environment rather than assuming the
  platform defaults to it.

### 11.9 Frontend optimization

Summary of points detailed in §6.9: `next/image`, `next/font`, code-splitting, memoization only where
profiled, and avoiding unnecessary Client Component boundaries as the primary lever (shipping less JS
beats optimizing JS you didn't need to ship).

### 11.10 Backend optimization

Summary of points above: async everywhere, no N+1, indexed queries, connection pooling reviewed, and
pagination enforced — in priority order, because a single N+1 or missing index typically dwarfs every
other optimization in this domain's read-heavy load-board queries.

---

## 12. Testing Standards

### 12.1 Unit tests

- Cover service-layer business logic (pricing rules, eligibility checks, state transition rules) with
  fast, isolated unit tests — no database, no network, dependencies mocked/faked via the same
  interfaces DI already provides (see [§5.7](#57-dependency-injection)), which is precisely why real
  DI is required rather than optional.
- Frontend: unit test pure functions/utilities and hooks with non-trivial logic
  (`calculateEstimatedDeliveryDate`, `useDebouncedValue`) directly.

### 12.2 Integration tests

- Cover the repository layer against a real (test) PostgreSQL instance (via `docker compose`/
  testcontainers) — never mock the database for repository tests, since the entire point is verifying
  the actual SQL/ORM mapping behaves correctly, including constraints and cascades (see
  [[user memory]] pattern: this mirrors the general principle that mocked persistence layers can hide
  real migration/constraint breakage).
- Backend integration tests run each test in its own transaction, rolled back at the end, so tests
  never leak state into one another and can run in parallel.

### 12.3 API tests

- Every endpoint has at least one test for the success path and one per meaningful failure path
  (validation error, not found, forbidden, conflict) using FastAPI's `TestClient`/`httpx.AsyncClient`
  against the real app (with a test DB), asserting both status code and response shape.
- Contract-level assertions (response matches `response_model` schema) are effectively free via
  Pydantic — still explicitly assert on the fields the frontend actually depends on, not just "200 OK."

### 12.4 Component tests

- Frontend components are tested with React Testing Library, asserting on rendered output and user-
  observable behavior (what's on screen, what happens on click) — never on implementation details
  (internal state values, component instance internals).
- Test the presentational component in isolation (props in, rendered output out) separately from the
  container/hook that fetches data, per the split described in [§6.16](#616-reusable-components-composition-and-when-to-split).

### 12.5 Test naming

- Descriptive, behavior-first names, not "test1": `it('rejects a booking when the load is already booked')`,
  Python: `def test_book_load_raises_conflict_when_already_booked():`. The test name alone should tell
  a reader what broke, without opening the test body.

### 12.6 Fixtures

- Shared test data builders (`make_shipment(**overrides)`, a `ShipmentFactory`) live in a shared test
  utilities module — never copy-pasted object literals across test files that will drift as the model
  gains fields.
- Fixtures default to the minimal valid object; tests override only the fields relevant to what
  they're asserting, so a test's intent is visible from its overrides alone.

### 12.7 Mocking

- Mock only true external boundaries (third-party APIs, email/SMS providers, payment processors) —
  never mock your own repository/service layer in an integration test (that defeats the test's
  purpose), and never mock the database in a way that could pass while a real migration/query is
  broken (this exact failure mode has burned teams before: mocked-DB tests green, prod migration
  broken).
- Prefer fakes (a real in-memory implementation of the same interface) over mocks for anything with
  meaningful behavior (e.g., a fake email service that records sent messages) over a mock that merely
  asserts "was called."

### 12.8 Coverage expectations

- Service/domain logic: high coverage expected (aim ~90%+) since this is where business rules and
  their edge cases live and regressions are costly.
- Repositories/integration paths: covered by integration tests for every query method, not
  necessarily every branch (the DB enforces a lot of what would otherwise need branch coverage).
- Coverage percentage is a signal, not a target to game — a suite that hits 100% via assertion-free
  tests is worse than 80% with meaningful assertions. Review test *quality* in code review, not just
  the coverage number.
- New code must not decrease overall coverage; CI enforces a coverage floor (see [§19](#19-cicd-standards)).

---

## 13. Git Workflow

### 13.1 Branch naming

`<type>/<short-description>`, kebab-case, referencing a ticket when one exists:
`feat/load-board-filters`, `fix/booking-race-condition-JIRA-482`, `chore/upgrade-sqlalchemy`,
`refactor/extract-quote-service`. Types match commit types (§13.2).

### 13.2 Commit message format

Conventional Commits: `<type>(<scope>): <summary>`, imperative mood, summary under ~72 characters, no
period.

```
feat(bookings): prevent double-booking with row-level lock
fix(quotes): correct rounding in fuel surcharge calculation
refactor(shipments): extract pricing rules into QuoteService
test(carriers): add coverage for expired-insurance rejection
docs(readme): document local docker compose setup
chore(deps): bump sqlalchemy to 2.0.32
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `style`, `ci`. Body (optional,
blank line after summary) explains *why*, not what — the diff already shows what.

### 13.3 Pull requests

- One logical change per PR. A PR that mixes a feature with an unrelated refactor or formatting
  sweep is split before review, not reviewed as one blob.
- PR description states: what changed, why, how it was tested, and any follow-up work deliberately
  deferred (with a linked issue, not a vague mention).
- Keep PRs small enough to review in one sitting (~400 lines changed is a practical soft ceiling for
  non-mechanical changes); large mechanical changes (a codemod, a dependency bump) are fine at any
  size but called out as mechanical in the description so reviewers know not to read every line
  equally closely.

### 13.4 Code review checklist

See the full checklist in [§21](#21-code-review-checklist).

### 13.5 Merge strategy

- Squash merge to `main` for feature branches, producing one clean commit per PR referencing the PR
  number — keeps `main` history readable and bisectable.
- `main` is always deployable. No merging a PR with failing CI, and no merging with unresolved
  review comments (either addressed or explicitly discussed and dismissed by the reviewer).

### 13.6 Release strategy

- Deploy from `main` after merge (continuous deployment) once CI passes, or via tagged releases if
  the team adopts a release-train model — pick one and keep it consistent; do not mix ad hoc manual
  deploys with an automated pipeline.
- Every deploy is tied to a specific commit SHA, visible in the running service (a `/health` or
  `/version` endpoint reporting the deployed SHA) so an incident can immediately confirm what's live.

### 13.7 Semantic versioning

- Any published/shared package (a shared types package, an internal SDK) follows SemVer strictly:
  `MAJOR.MINOR.PATCH` — major for breaking changes, minor for backward-compatible additions, patch
  for backward-compatible fixes. The application itself (frontend/backend deploys) is versioned by
  commit SHA/date, not SemVer, since it's continuously deployed rather than distributed.

---

## 14. Documentation Standards

### 14.1 README

- Each deployable unit (root, `server/`) has a README covering: what it is, prerequisites, one-command
  local setup, how to run tests, how to run the linter/formatter, and where to find deeper docs
  (`docs/`). A new engineer must be able to get a working local environment from the README alone,
  with zero tribal knowledge.

### 14.2 Architecture docs

- `docs/architecture.md` describes the system at a level above any single file: the layering
  (§5.1), the major services/resources, how frontend and backend communicate, and how data flows for
  the core business flow (posting a load → quoting → booking → delivery → invoicing). Update it in
  the same PR that changes the architecture it describes — an architecture doc that lags the code is
  worse than none, because it actively misleads.

### 14.3 API docs

- Living API documentation is the FastAPI-generated OpenAPI spec (§9.10/§9.11) — do not maintain a
  separate hand-written API reference that can drift.

### 14.4 Decision records

- Significant, hard-to-reverse decisions (choosing a queue technology, choosing the auth model,
  choosing to denormalize a table) get a lightweight ADR in `docs/adr/NNNN-title.md`: context,
  decision, consequences, alternatives considered. Write it when the decision is made, not
  retroactively — the point is capturing *why*, which is only fully known in the moment.

### 14.5 Docstrings

- Python: every public service and repository method has a docstring (Google or NumPy style, pick
  one and stay consistent — Google style recommended for readability) stating what it does, its
  params, return value, and any exceptions it raises that callers must handle.

```python
async def book_load_for_carrier(self, load_id: UUID, carrier_id: UUID) -> Booking:
    """Book an open load for a carrier, transitioning it out of the load board.

    Args:
        load_id: The load being booked.
        carrier_id: The carrier booking the load. Must be verified and have
            valid insurance on file (see CarrierService.is_eligible_to_book).

    Returns:
        The created Booking record.

    Raises:
        LoadNotFoundError: If load_id does not exist or is soft-deleted.
        LoadAlreadyBookedError: If the load is no longer in `open` status.
        CarrierNotEligibleError: If the carrier fails eligibility checks.
    """
```

- TypeScript: JSDoc is required only for exported functions/hooks whose behavior isn't obvious from
  the name and types alone — types themselves (via TSDoc-style `/** */` on non-obvious fields) matter
  more than function-level prose in a strictly-typed codebase.

---

## 15. Logging Standards

### 15.1 Structured logging

- All backend logs are structured JSON in non-local environments (one JSON object per line: `level`,
  `timestamp`, `message`, `logger`, plus contextual fields like `correlation_id`, `user_id`,
  `shipment_id`) — never unstructured string interpolation logs in production, since they can't be
  queried/aggregated reliably.
- Frontend errors reported to an error-tracking service (e.g., Sentry) include the same correlation
  ID as the backend request that failed, so a single incident can be traced end-to-end.

### 15.2 Log levels

| Level | Use |
|---|---|
| `DEBUG` | Verbose diagnostic detail, off by default in production |
| `INFO` | Normal significant events: request handled, booking created, migration ran |
| `WARNING` | Recoverable/unexpected situations worth investigating (a retried external call, a fallback path taken) |
| `ERROR` | An operation failed and the user/caller was impacted; always includes exception detail server-side |
| `CRITICAL` | The service itself is degraded/down (DB unreachable, out of memory) — pages on-call |

Never log business-as-usual events at `ERROR`/`WARNING` (alert fatigue trains people to ignore them);
never log a real failure at `INFO` (it becomes invisible).

### 15.3 Correlation IDs

- Every incoming request is assigned a correlation ID (from an inbound `X-Correlation-ID` header if
  present, generated fresh otherwise) by middleware, attached to the logging context for the duration
  of the request, and returned in the response (including error responses, per §9.6) and in any
  downstream service/queue call.

### 15.4 Request IDs

- Distinct from correlation ID when a single correlation ID spans multiple internal requests
  (e.g., a background job triggered by a request) — request ID identifies one HTTP request/response
  pair specifically; correlation ID threads the whole logical operation. If the system never has this
  fan-out, a single ID serving both purposes is fine — don't add the distinction speculatively.

### 15.5 Error logging

- Every caught exception that results in a 5xx response logs the full exception (type, message,
  stack trace) at `ERROR` with the correlation ID and relevant context (route, user ID if
  authenticated) — before it's translated into the safe, generic client-facing message (§16.1).

### 15.6 Audit logging

- Security- and business-significant actions (login, password change, booking creation/cancellation,
  invoice generation, any admin override) are written to an append-only audit log distinct from
  general application logs — who did what, to which resource, when — retained per compliance
  requirements, and never deletable by application code paths (only by an explicit, separately
  authorized retention job).

### 15.7 Sensitive information rules

- Never log: passwords (hashed or plain), full tokens/API keys, full credit card/bank account
  numbers, full SSNs or driver's license numbers, raw request/response bodies for endpoints carrying
  such data.
- When such data must be referenced for debugging, log a masked/truncated form (last 4 digits, a
  hash) — never the raw value.
- This rule applies transitively: if a logged object (e.g., a full request payload logged for
  debugging) *contains* a sensitive field, the logging code must redact that field before logging,
  not rely on the field "usually" being absent.

---

## 16. Error Handling

### 16.1 Backend exceptions

- Domain-specific exceptions, one hierarchy per bounded context, deriving from a common
  `DomainError` base (`LoadNotFoundError`, `LoadAlreadyBookedError`, `CarrierNotEligibleError`),
  raised from services — never a bare `Exception`/`ValueError` for expected business-rule failures,
  since the global handler needs a stable type to map to the right HTTP status/error code.
- A single set of `@app.exception_handler(...)` registrations in `main.py` maps each domain exception
  type (and its subclasses) to the correct status code and the standard error shape (§9.6). Routers
  never contain their own `try/except HTTPException` translation logic.
- Truly unexpected exceptions (a bug, an unhandled edge case) are caught by a catch-all handler that
  logs full detail server-side and returns a generic `500` with no internal detail to the client.

### 16.2 Frontend error boundaries

Covered in [§6.10](#610-error-boundaries). Additional: a top-level `app/global-error.tsx` catches
anything that escapes route-level boundaries, so the app never renders a completely blank white
screen.

### 16.3 Retry strategies

- Idempotent operations (per §9.9) that fail due to transient errors (network blip, momentary 503)
  may be retried automatically by the frontend API client with exponential backoff and a capped
  retry count (e.g., 3 attempts) — never retried unboundedly, and never retried for non-idempotent
  operations without an idempotency key.
- Backend calls to external services (carrier insurance verification APIs, geocoding) use the same
  bounded-backoff pattern, with a circuit breaker if a dependency's failure could otherwise cascade
  into exhausting the app's own connection pool.

### 16.4 User-friendly errors

- Every user-facing error message answers: what happened, and what can the user do next ("This load
  was just booked by another carrier. Refresh the load board to see current availability.") — never
  a bare technical message ("409 Conflict") or an internal code with no context.

### 16.5 Monitoring

- 5xx rate, p95/p99 latency per endpoint, and queue/job failure rates are tracked and alertable.
  Any new endpoint inherits this automatically via the shared middleware (§7.13) — do not build
  bespoke per-endpoint monitoring.

---

## 17. Environment Management

### 17.1 Environment variables

- All configuration that differs by environment (DB URL, JWT signing key, third-party API keys,
  CORS allowlist, feature flags) is an environment variable, read only through the typed `Settings`
  class (§7.8) — never read directly via `process.env`/`os.environ` outside that one module (backend)
  or outside `next.config.ts`/a single typed config module (frontend).
- Frontend env vars intended for the browser must use the `NEXT_PUBLIC_` prefix deliberately and
  sparingly — anything with that prefix is shipped to every client and must never be a secret.

### 17.2 Secrets

Covered in [§10.5](#105-secrets-management). Local dev secrets live in a git-ignored `.env.local`;
`.env.example` is committed with variable names and placeholder/dummy values only.

### 17.3 Configuration hierarchy

Precedence, highest to lowest: platform-injected environment variables (production/staging secrets
manager) → `.env.local` (git-ignored, local overrides) → `.env` (git-ignored, local defaults) →
hardcoded defaults in `Settings` (only for genuinely non-sensitive, safe-everywhere defaults like a
default page size).

### 17.4 Development / Testing / Production

| Environment | DB | Debug/verbose errors | CORS | Logging |
|---|---|---|---|---|
| Development | Local Postgres via Docker Compose | On (full tracebacks locally acceptable) | Permissive (localhost origins only) | Human-readable console |
| Testing/CI | Ephemeral Postgres (container per run) | On, but assertions treat any unhandled error as a test failure | N/A | Verbose, captured per-test |
| Production | Managed Postgres, connection pooled | Off — generic error responses only (§16.1) | Strict allowlist of real frontend origin(s) | Structured JSON, shipped to a log aggregator |

Never let a production/staging config value be reachable by accident from a development default —
each environment's `Settings` values are sourced from that environment's own secrets, with no shared
fallback to a "convenient" default that happens to point at a real resource.

---

## 18. Docker Standards

### 18.1 Dockerfile best practices

- Pin base image versions explicitly (`python:3.12-slim`, `node:22-slim`) — never `latest`, which
  makes builds non-reproducible and silently changes behavior over time.
- Run as a non-root user in the final image.
- Order layers from least- to most-frequently-changing (dependency manifests copied and installed
  before application source) so Docker's build cache is actually effective on every code-only change.
- `.dockerignore` excludes `node_modules`, `.git`, `.env*`, test artifacts, and anything not needed
  in the image — keeps build context small and prevents accidentally baking local secrets into an
  image layer.

### 18.2 Multi-stage builds

- Frontend: a `deps` stage installs dependencies, a `builder` stage runs `next build`, and a final
  slim `runner` stage copies only the production output (`.next/standalone` output mode) — the final
  image never contains dev dependencies, source maps meant for debugging only, or build tooling.
- Backend: a `builder` stage resolves/installs Python dependencies into a venv/wheel cache, the final
  stage copies only the installed environment and application code — no compilers/build-only system
  packages in the runtime image.

### 18.3 Compose

- `docker-compose.yml` at the repo root brings up the full local stack (Postgres, backend, frontend)
  with one command, matching the README's documented setup step (§14.1). Service names are the
  domain-meaningful hostnames used in local config (`db`, `api`, `web`), not generic (`service1`).
- Environment-specific overrides (e.g., hot-reload volume mounts for local dev only) live in a
  `docker-compose.override.yml`, never baked into the base file that could accidentally be reused
  for a production-like compose invocation.

### 18.4 Volumes

- The Postgres data directory is a named volume, not a bind mount to an arbitrary host path, so local
  data survives container recreation predictably and isn't accidentally `.gitignore`'d into loss or
  committed into the repo.
- Application source is bind-mounted only in the local dev compose override, for hot reload — never
  in anything resembling a production image.

### 18.5 Networking

- Services communicate over the Compose-managed internal network by service name (`api` calling
  `db:5432`) — never by hardcoded `localhost`/IP, which breaks the moment the topology changes.
- Only the frontend's port (and, in local dev, the API's port for direct testing) is published to the
  host; the database port is not published beyond local dev convenience, and never published in any
  shared/staging environment.

### 18.6 Health checks

- Every service defines a Compose/orchestrator health check hitting a real `/health` endpoint (backend)
  or a TCP/HTTP check (frontend) — dependent services (`api` depending on `db`) use
  `depends_on: condition: service_healthy`, not a bare `depends_on` (which only waits for container
  start, not readiness) or a manual `sleep` in an entrypoint script.

### 18.7 Image optimization

- Final image size is a reviewed concern, not an afterthought: slim base images, multi-stage builds
  (§18.2), no dev/build tooling in the runtime layer, and dependency pruning (`npm ci --omit=dev`
  equivalent, Python wheel-only installs) before the final copy.

---

## 19. CI/CD Standards

### 19.1 Linting

- ESLint (frontend) and Ruff (backend, lint mode) run on every push/PR; a lint failure blocks merge.
  No `eslint-disable`/`# noqa` without a same-line comment explaining why the rule genuinely doesn't
  apply — a bare suppression is treated as a review-blocking smell, not a pass.

### 19.2 Formatting

- Prettier (frontend) and Ruff format (backend) run in **check mode** in CI (never auto-fix-and-
  commit in the pipeline) — a formatting diff fails the build, forcing the contributor to run the
  formatter locally and commit the result, keeping history clean.

### 19.3 Testing

- Full test suite (unit + integration, §12) runs on every PR against an ephemeral test database
  spun up in CI, matching the same Compose/container config used locally so "works in CI, fails
  locally" (or vice versa) doesn't happen. Coverage floor (§12.8) is enforced as a CI gate.

### 19.4 Security scanning

- Dependency vulnerability scanning (`npm audit`/`pip-audit` or equivalent, e.g., Dependabot/Snyk)
  runs on every PR and on a schedule against `main`, failing the build on newly introduced
  high/critical vulnerabilities.
- Static analysis for common security issues (secrets scanning to catch an accidentally committed
  key, per §10.5) runs on every push, not just on PRs to `main`, since a secret leaked to any branch
  is already leaked.

### 19.5 Build verification

- Frontend production build (`next build`) and backend import/startup check run in CI — a PR that
  passes lint and tests but fails to actually build must still be blocked from merge.
- Type checking (`tsc --noEmit`, `mypy`/`pyright` if adopted for the backend) is a separate, explicit
  CI step — do not rely on the bundler's/test runner's incidental type checking as the only check.

### 19.6 Deployment

- Deploys are triggered from `main` after all CI gates pass, fully automated (no manual "click deploy"
  step in the steady state) — see §13.6. Each deploy is traceable to the exact commit SHA and PR that
  produced it.
- Database migrations run as an explicit, separate pipeline step before the new application version
  receives traffic, and are written to be safe if applied while the *previous* version is still
  briefly running (§8.8 backward-compatible migration ordering) — this is what makes zero-downtime
  deploys actually safe, not just fast.

### 19.7 Rollback strategy

- Every deploy target keeps the previous release's artifact/image available for immediate rollback
  without a rebuild. Rolling back application code is always safe by construction because migrations
  are backward-compatible (§8.8/§19.6) — rolling back is never blocked on "but the new schema isn't
  compatible with the old code."
- A rollback is itself a normal, fast, low-ceremony operation (redeploy the previous SHA), not a
  special/manual/undocumented procedure — if it would take more than a few minutes to execute, that's
  a gap to fix before it's needed under pressure.

---

## 20. AI Agent Rules

These rules apply specifically to AI coding agents (including Claude) working in this repository, in
addition to every rule above.

### 20.1 How AI agents should modify code

- Match the existing style and patterns of the surrounding code exactly, even in a still-small
  codebase — new code sets precedent for the next 99 engineers who will pattern-match off it, so a
  shortcut taken "just this once" becomes the de facto standard.
- Make the smallest change that correctly satisfies the request. Do not refactor unrelated code,
  rename unrelated variables, or "clean up while you're in there" as a side effect of an unrelated
  task — bundle unrelated improvements into their own PR/commit so they can be reviewed and reverted
  independently.
- Do not introduce a new library, pattern, or architectural approach not already sanctioned in this
  document without surfacing that choice explicitly to the user first — this document is the
  contract; deviating from it silently breaks the "single source of truth" property the whole team
  relies on.

### 20.2 How to avoid regressions

- Before changing a function/module with existing callers, find every call site (grep/search the
  whole repo, not just the file you're editing) and confirm the change doesn't break any of them —
  do not assume a signature change is safe because it compiles; check behavior, not just types.
- Run the relevant test suite (and, where feasible, the specific tests covering the changed code)
  before declaring a task complete — do not report success based on the code "looking right."
  Type-checking and passing tests verify correctness of code, not correctness of the *feature* — for
  UI changes, actually exercise the feature (per the global instructions on testing UI changes)
  before calling it done.
- When editing a database model, check for existing migrations, existing queries against that table,
  and existing serialization schemas that reference the changed columns — a model change is rarely
  isolated to the model file alone.

### 20.3 How to preserve architecture

- Respect the layering in [§5.1](#51-clean-architecture): never add business logic to a router or a
  repository, never import framework code into `domain/`, never bypass the service layer to call a
  repository directly from a route handler "just this once."
- Respect the frontend feature boundaries in [§2.4](#24-feature-first-vs-layer-first)/[§2.5](#25-shared-code-rules):
  don't reach into another feature's internal files; promote to shared code properly if reuse is
  genuinely needed.
- If a task seems to require violating an architectural rule to be convenient, that is a signal to
  stop and either find the compliant approach or flag the tension to the user — not to quietly break
  the rule.

### 20.4 How to search before changing

- Before implementing something that feels generic (a date formatter, a money formatter, a
  pagination helper), search the codebase for an existing equivalent first — duplicated utility
  logic is one of the fastest ways this document's DRY principle (§5.3) erodes in practice.
- Before adding a new dependency, check whether an already-installed dependency solves the problem.
  Adding a second library for the same job (a second HTTP client, a second form library) violates
  [§6.12](#612-forms)-style "pick one" rules and bloats the bundle/dependency surface for no benefit.
- Before creating a new file/folder, check [§2](#2-folder-structure-rules) for where it actually
  belongs — don't default to the folder you happen to be looking at.

### 20.5 How to update documentation

- Any change to public API shape, environment variables, folder structure, or an architectural
  decision must update the relevant doc in the same PR/commit: OpenAPI is self-updating (§9.10), but
  `README.md`, `docs/architecture.md`, `.env.example`, and this file itself are not — update them by
  hand when the change makes them stale.
- If you add a genuinely new standing pattern (not covered by this document), propose an addition to
  this document rather than letting the pattern live only as tribal knowledge in a diff.

### 20.6 How to write migrations

- Follow [§8.8](#88-migration-strategy) exactly: autogenerate, then hand-review the generated
  migration for correctness (especially renames, which autogenerate mishandles as drop+add), write a
  real `downgrade()`, and split NOT-NULL-on-existing-table changes into the required multi-step
  sequence for zero-downtime safety.
- Never hand-edit a migration file that has already been referenced as merged/deployed — write a new
  corrective migration instead.

### 20.7 How to write tests

- Follow [§12](#12-testing-standards): unit-test new service logic, integration-test new repository
  queries against a real test database, and add an API test for any new/changed endpoint covering both
  the success path and at least one realistic failure path.
- Do not write tests that assert on implementation details (internal variable names, private method
  calls) — assert on observable behavior (return values, response bodies, rendered DOM), so tests
  survive refactors that don't change behavior.
- Do not delete or weaken an existing test to make a change pass unless the test was asserting
  incorrect/outdated behavior — if that's the case, say so explicitly rather than silently loosening
  an assertion.

### 20.8 How to review changes before completion

Before reporting a task complete, verify, in order:

1. **Does it compile/typecheck?** (`tsc --noEmit`, and the Python equivalent if type-checked.)
2. **Does it lint/format clean?** (§19.1/§19.2 tools, zero new suppressions without justification.)
3. **Do existing tests still pass**, and have new tests been added for new behavior?
4. **Does it follow this document's architecture/naming/style rules** — spot-check against
   [§21](#21-code-review-checklist) as if reviewing someone else's PR.
5. **Has documentation been updated** per [§20.5](#205-how-to-update-documentation) if applicable?
6. **For UI-visible changes**, has the feature actually been exercised in a running app (per the
   global verification instructions), not just type-checked?

Report honestly if any of these couldn't be verified (e.g., no way to run the UI in this
environment) rather than implying full verification occurred.

---

## 21. Code Review Checklist

Use this checklist for every PR — as an author before requesting review, and as a reviewer before
approving. Grouped by category; not every item applies to every PR, but scan all sections.

**Correctness & Logic**
- [ ] Does the code do what the PR description claims, for both the happy path and edge cases?
- [ ] Are boundary conditions handled (empty list, zero, negative numbers, null/undefined, max
      values like `MAX_LOAD_WEIGHT_LBS`)?
- [ ] Are all Promise/async calls properly awaited (no floating/unhandled promises)?
- [ ] Is there any off-by-one error in pagination, loops, or date range logic?
- [ ] Are timezones handled correctly for any date/time logic (§8.9)?
- [ ] Does concurrent access to the same resource (e.g., two carriers booking the same load) get
      handled safely (row locking, unique constraint, optimistic concurrency)?
- [ ] Are floating-point comparisons/money calculations avoided in favor of `Decimal`/`Numeric` (§8.9)?
- [ ] Do error paths actually get exercised by a test, not just the happy path?

**Architecture & Design**
- [ ] Is business logic in the service layer, not the router/repository/component (§5.1, §5.9)?
- [ ] Does the change respect existing feature/module boundaries (§2.4, §2.5)?
- [ ] Is a new abstraction justified by an existing second use case, not speculative (§5.5)?
- [ ] Is dependency injection used rather than direct instantiation of a dependency (§5.7)?
- [ ] Does a repository method contain only data access, no business rules (§5.8)?
- [ ] Is there duplicated logic that should be extracted (rule of three, §5.3), or is a proposed
      abstraction actually premature (§5.4)?

**Naming & Readability**
- [ ] Do names reveal intent without needing a comment to explain them (§3)?
- [ ] Are booleans named with `is`/`has`/`should` and phrased positively (§3.2)?
- [ ] Is any function over the ~40-line soft limit, and if so, should it be split (§4.7)?
- [ ] Is cyclomatic complexity low, using guard clauses instead of nested conditionals (§4.9)?
- [ ] Are magic numbers/strings named as constants (§4.10)?
- [ ] Are comments explaining "why," not restating "what" (§4.2)?
- [ ] Is dead/commented-out code removed?

**Frontend-specific**
- [ ] Is `'use client'` scoped as low in the tree as possible (§6.2)?
- [ ] Are Server Components used for data fetching where the data is known at render time (§6.2)?
- [ ] Does a new list/loading state have a purposeful skeleton, not a generic spinner (§6.11)?
- [ ] Is the component accessible: semantic elements, labeled inputs, keyboard navigable, adequate
      contrast (§6.7)?
- [ ] Is server-side validation present for anything client-validated (§6.12, §7.4)?
- [ ] Is server data kept out of global client state stores, left to React Query (§6.14)?
- [ ] Are images using `next/image`, fonts using `next/font` (§6.9)?
- [ ] Does a new route segment liable to fail independently have its own `error.tsx` (§6.10)?

**Backend-specific**
- [ ] Are all request/response bodies typed Pydantic schemas, never raw `dict` (§7.4, §7.5)?
- [ ] Is the ORM model kept out of the response, mapped through a response schema (§7.5)?
- [ ] Are DB calls fully `async` with no blocking calls inside an `async def` (§7.12)?
- [ ] Is authorization checked in the service layer for the specific resource, not just
      "user is logged in" (§7.7)?
- [ ] Is the whole business operation wrapped in one transaction with no partial-write risk (§7.11)?
- [ ] Are domain exceptions used instead of raising `HTTPException` from inside a service (§16.1)?

**Database**
- [ ] Does every new foreign key have an explicit `ON DELETE` policy (§8.4)?
- [ ] Does every new foreign key and every new filterable/sortable column have an index (§8.3)?
- [ ] Is the migration hand-reviewed (not blindly trusting autogenerate), with a real `downgrade()` (§8.8)?
- [ ] If adding a `NOT NULL` column to an existing table, is it split into the safe multi-step
      sequence (§8.8)?
- [ ] Are money fields `Numeric`/`Decimal`, never `float` (§8.9)?
- [ ] Are audit columns (`created_at`, `updated_at`, actor IDs) present on new business-relevant
      tables (§8.7)?
- [ ] Is soft delete used (not hard delete) for business-meaningful records, with query filters
      applied consistently (§8.6)?

**API Design**
- [ ] Is the new/changed endpoint versioned, paginated (if a list), and consistent with existing
      route naming (§9.1–§9.3)?
- [ ] Are error responses using the standard shape with a stable `code` (§9.6)?
- [ ] Is the correct HTTP status code used for each outcome (§9.7)?
- [ ] Is a financially significant `POST` idempotent via an `Idempotency-Key` (§9.9)?
- [ ] Does the route declare `response_model`, `status_code`, and OpenAPI metadata (§9.11)?
- [ ] Is a breaking change actually additive/non-breaking, or does it correctly require a version
      bump (§9.2)?

**Security**
- [ ] Is every new input validated server-side, regardless of client-side validation (§10.6)?
- [ ] Is all DB access parameterized with no possibility of string-built SQL (§10.9)?
- [ ] Are secrets absent from the diff — no keys, tokens, credentials, even in test fixtures (§10.5)?
- [ ] Is authorization re-checked server-side for the specific action, not assumed from the UI (§10.8)?
- [ ] Does any new cookie carry `Secure`, `httpOnly`, `SameSite` as appropriate (§10.12)?
- [ ] Does any new external URL fetch (webhook, callback) validate against SSRF (§10.8)?
- [ ] Is any new logging statement free of passwords, tokens, and full PII (§15.7)?

**Performance**
- [ ] Does a new list/detail endpoint avoid N+1 queries (checked via `EXPLAIN`/query log) (§11.2)?
- [ ] Is a new query's `WHERE`/`ORDER BY`/`JOIN` column indexed (§11.3)?
- [ ] Is pagination enforced with a server-side max `limit` (§9.3)?
- [ ] Is anything expensive and reusable cached with an explicit invalidation story (§11.1)?

**Testing**
- [ ] Does new service logic have unit tests covering edge cases, not just the happy path (§12.1)?
- [ ] Does a new repository query have an integration test against a real test DB (§12.2)?
- [ ] Does a new/changed endpoint have both success- and failure-path tests (§12.3)?
- [ ] Do test names describe behavior, not "test1"/"testFoo" (§12.5)?
- [ ] Are fixtures/factories reused rather than duplicated object literals (§12.6)?
- [ ] Is coverage maintained or improved, not silently dropped (§12.8)?

**Git/Process**
- [ ] Is the PR scoped to one logical change, without unrelated refactors bundled in (§13.3)?
- [ ] Does the commit message follow Conventional Commits format (§13.2)?
- [ ] Is documentation (README, architecture doc, `.env.example`) updated if this PR makes it
      stale (§20.5)?
- [ ] Does CI pass fully — lint, format check, type check, tests, security scan (§19)?

---

## 22. Best Practices Reference

Quick-reference index of modern best practices this document expects by default. Each item links
back to the section with full detail and rationale — use this as a checklist when in doubt about
whether a technique is "the way we do it here."

**Next.js**: Server Components by default (§6.2); explicit cache/revalidate intent per fetch,
verified against the installed version's docs (§6.4); Suspense for independently slow data (§6.3);
Metadata API for SEO (§6.8); `next/image` and `next/font` (§6.9); route-level error boundaries (§6.10).

**React**: composition over configuration explosion (§6.16); presentational/container split (§6.16);
least-powerful-state-tool-first (§6.14); memoize only where profiled, not reflexively (§6.9);
accessibility as a correctness requirement, not a nice-to-have (§6.7).

**TypeScript**: `strict` mode always on (already configured in `tsconfig.json`); no `any` without a
justifying comment; derive types from schemas (`z.infer`) rather than hand-duplicating (§6.13); named
exports (§4.5); explicit return types on exported functions.

**FastAPI**: thin routers, fat services (§5.9, §7.2); `Depends`-based DI everywhere (§5.7, §7.3);
Pydantic schemas for every boundary, never raw dicts (§7.4, §7.5); async all the way down (§7.12);
global exception handlers over per-route try/except (§16.1).

**Python**: type hints on all public function signatures; `Decimal` for money (§8.9); dataclasses/
Pydantic models over loose dicts for structured data; context managers for resource lifecycles
(sessions, files, locks).

**PostgreSQL**: UUID primary keys (§8.5); explicit `ON DELETE` policy on every FK (§8.4); index every
FK and every filter/sort column (§8.3); `timestamptz` always, never naive timestamps (§8.9); partial
unique indexes for soft-deletable uniqueness (§8.6).

**SQLAlchemy**: 2.0-style typed models (`Mapped[...]`, `mapped_column`); async engine/session
(`asyncpg`) (§7.12); eager loading (`selectinload`/`joinedload`) chosen deliberately to avoid N+1
(§11.2); repository pattern encapsulating all query construction (§5.8).

**Docker**: pinned base images, multi-stage builds, non-root user, small final images, real health
checks driving `depends_on: condition: service_healthy` (§18).

**REST APIs**: versioned, paginated, consistent error shape, correct status codes, idempotency keys
on financial writes, self-documenting via OpenAPI (§9).

**Authentication**: short-lived signed access tokens, rotated server-side refresh tokens in
`httpOnly` cookies, argon2id/bcrypt password hashing, generic failure messages preventing enumeration
(§10.1–§10.4).

**Security**: input validated at every boundary, parameterized queries only, secrets never
committed, OWASP Top 10 as a standing PR checklist, CSP and secure cookie flags in place (§10).

**Performance**: no N+1 queries, indexed hot-path columns, connection pooling reviewed against real
concurrency, pagination everywhere, caching with explicit invalidation, compression enabled (§11).

**Accessibility**: semantic HTML, labeled inputs, keyboard-navigable flows, WCAG 2.1 AA contrast,
never color-only signaling (§6.7).

**Observability**: structured JSON logs, correlation IDs threading every request, audit log for
sensitive actions, 5xx/latency monitoring wired in by default via shared middleware (§15, §16.5).

**Maintainability**: DRY without premature abstraction, YAGNI enforced in review, small functions/
files, no dead code, this document kept current as the actual source of truth (§1, §5, §20.5).

**Scalability**: stateless API processes, horizontally scalable by design, schema designed for 10x
current volume, partitioning considered deliberately once a documented threshold is hit (§1.3, §8.10).

**Testing**: unit tests for business logic, integration tests against a real test database, API
tests for every endpoint's success and failure paths, meaningful assertions over vanity coverage
percentages (§12).

**Documentation**: README enabling zero-tribal-knowledge setup, self-updating OpenAPI docs, ADRs for
hard-to-reverse decisions, docstrings on every public service/repository method (§14).
