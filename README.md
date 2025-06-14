# Vehicle Matcher

A simple TypeScript + Express backend with PostgreSQL to match free-text vehicle descriptions against a structured vehicle catalogue and return the best-matching `vehicle.id` with a confidence score `(0–10)`.

## Table of Contents

1. [Overview](#overview)  
2. [Prerequisites](#prerequisites)  
3. [Project Structure](#project-structure)  
4. [Setup & Run](#setup-and-run)  
5. [Architecture](#architecture)  
   - [High-Level Diagram](#high-level-diagram)  
   - [Runtime Components](#runtime-components)  
   - [Data Flow](#data-flow)  
6. [Specification](#specification)  
   - [Description Parser](#description-parser)  
   - [Matcher & Scoring](#matcher--scoring)  
   - [Caching Strategy](#caching-strategy)  
7. [Future Backlog](#future-backlog)  
8. [Security Considerations](#security-considerations)  

## Overview

This service exposes:

- **GET /status** → health check  
- **POST /match** → returns `{ vehicleId, confidence }` for a description  
- **POST /admin/cache/reload** → force in-memory cache reload (protected by `ADMIN_TOKEN`)

## Prerequisites

- Node.js (v20+) and npm
- Docker & Docker Compose (for containerized setup)

## Project Structure

```text
.
├── prisma
│   └── schema.prisma
├── src
│   ├── cache.ts
│   ├── matcher.ts
│   ├── parser.ts
│   ├── server.ts
│   └── test.ts
├── Dockerfile
├── Makefile
├── README.md
├── data.sql
├── docker-compose.yml
├── input.txt
├── .env.example
├── package.json
└── tsconfig.json
```

## Setup and Run

### Makefile Cheatsheet

- `make install` — install deps & generate Prisma client  
- `make up`      — spin up database + backend server  
- `make test`    — run all descriptions through `/match`  
- `make down`    — tear down containers  
- `make clean`   — remove `node_modules` & build artifacts  

### 1. Local install

```shell
$ make install
```

### 2. Spin up services via Docker

Create a `.env` (see `.env.example`) to configure environment variable. Then,

```shell
$ make up
```

- Starts the PostgreSQL imported from `data.sql`

- Builds and starts backend server on port 3000

### 3. Test

#### Health check

```shell
$ curl -i -X GET "http://localhost:3000/status"
```

#### Batch runner

```shell
$ make test
```

Reads each line from `input.txt`, POSTs to `/match`, logs results.

#### Single match

```shell
$ curl -i -X POST "http://localhost:3000/match" \
  -H 'Content-Type: application/json' \
  -d '{"description":"Volkswagen Golf 110TSI Comfortline Petrol Automatic Front Wheel Drive"}'
```

### 4. Tear down (optional)

```shell
$ make down
```

- Stop services and removes volumes (resets database)

### 5. Clean local artifacts (optional)

```shell
$ make clean
```

- Deletes node_modules and compiled dist/ directory.

## Architecture

### High-Level Diagram

```text
┌───────────┐      ┌──────────────┐
│  Clients  │─────▶│   Node API   │
└───────────┘      │ (Express+TS) │
                   └──────┬───────┘
                          │
                          │
                    In-memory Cache
                          │
                          ▼
                    ┌───────────┐
                    │   Prisma  │
                    │   Client  │
                    └─────┬─────┘
                          │
                          ▼
                    ┌───────────┐
                    │ PostgreSQL│
                    │ (vehicle, │
                    │  listing) │
                    └───────────┘
```

### Runtime Components

- **Clients**: HTTP callers (curl, test script, frontend).
- **Node API: (Express + TypeScript)**
    - **Routing & Middleware**: JSON parsing, request logging (Morgan), error handlers.
    - **Parser (parser.ts)**: converts free-text into structured attributes.
    - **Matcher (matcher.ts)**: scores against the in-memory cache and applies tie-breakers.
    - **Cache Management**:
        - Startup load via initCache()
        - Periodic refresh (setInterval)
        - On-demand reload via /admin/cache/reload
- **In-memory Cache**: Two objects held in process memory:
    - vehicleCache: Vehicle[]
    - listingCountMap: Record<string, number>
    > **Note:** In-memory caching is ideal for our current, modest dataset—it delivers microsecond-scale lookups with zero external dependencies. Once the catalogue grows or we run multiple service instances, we can migrate to a distributed cache (e.g. Redis) to share state across nodes, use a simple lock (Redis `SETNX`) for coordinated reloads, and TTLs or pub/sub invalidation to keep all caches in sync.
- **Prisma Client**: used only during cache rebuilds to query PostgreSQL.
- **PostgreSQL**: persists the vehicle and listing tables (initialized from data.sql).

### Data Flow

#### **1. `/match` Request**

- **Client** → `POST /match` `{ description }`
- **Express handler**:
  1. Validate payload  
  2. `parseDescription(description)` → `{ make?, model?, … }`  
  3. `findBestMatch(attrs)`:
     - Filter `vehicleCache` (by make/model if present)  
     - Compute scores  
     - Tie-break with `listingCountMap`  
  4. Return `{ vehicleId, confidence }`
- **Response** → Client

> All operations are in-memory; no DB calls on the hot path.

#### **2. Cache Reload**

- **Trigger**:
  - Periodic timer  
  - `POST /admin/cache/reload` with header `authorization`
- **Express handler**:
  1. Validate `authorization`  
  2. Call `initCache()`:
     - `prisma.vehicle.findMany()` → refresh `vehicleCache`  
     - `prisma.listing.groupBy(...)` → rebuild `listingCountMap`
- In-memory data is updated; subsequent `/match` uses the fresh cache.  

## Specification

### Description Parser

- Trims common noise markers (e.g. `with`, `swap`, `for sale`, etc.).
- Normalizes synonyms and abbreviations:
    - VW → Volkswagen
    - Hybrid → Hybrid-Petrol
    - Drive types: 4x4, 4WD, FWD, RWD → full text.
- Extracts attributes: `make`, `model`, `badge`, `fuelType`, `transmissionType`, `driveType`.

### Matcher & Scoring

- Loads all vehicles via Prisma.
- Assigns weights (sum to 10) to each attribute: `make=2`, `model=2`, `badge=3`, `fuelType=1`, `transmissionType=1`, `driveType=1`.
- Matches only whole words for badge to avoid false positives.
- Picks the variant with more listings.

### Caching Strategy

To reduce latency and database load, we use a hybrid in-memory cache:
- Startup load: on server launch, all vehicles and listing-counts are loaded into RAM.
- Periodic refresh: every `CACHE_REFRESH_INTERVAL_MS` (default 600 000 ms = 10 min) the cache auto-reloads.
- On-demand reload: an admin endpoint allows you force a reload anytime:

```shell
$ curl -X POST http://localhost:3000/admin/cache/reload \
    -H "authorization: ${ADMIN_TOKEN}"
```

Currently, the `ADMIN_TOKEN` is stored in the `.env` file for the demo. In staging or production, it should be handled by JWT or OAuth2 authentication type.

## Future Backlog

### Optimization 

#### 1. **Accuracy Enhancement**

- Detect keywords like “swap” or “engine swap” indicating non-stock configurations.  
- **Semantic Embeddings / Vector Search**  
   - Precompute an embedding for each vehicle’s combined attributes (make, model, badge, etc.) using a language model (e.g. OpenAI embeddings or a local Sentence-Transformer).  
- Store these vectors in a nearest-neighbor index (FAISS, Redis Vector, pgvector).  
   - At runtime, convert the description into its semantic embedding, retrieve the nearest vehicle vectors from the index, and—if multiple candidates score equally—select the one with the highest listing count.

#### 2. **Precompute & Persist Normalized Fields**

- Store lower-cased or simplified variants of `make`, `model`, `badge`, etc. in the database and cache.
- Eliminates per-request calls to `.toLowerCase()` and regex recreation.

#### 3. **Database Indexing**

- Add B-tree indexes on `LOWER(make)` and `LOWER(model)`.
- Consider a GIN trigram index on `badge` for efficient partial or `ILIKE '%…%'` searches.

#### 4. **Fuzzy Matching / Typos**

- Integrate a Levenshtein or trigram-based fuzzy-match library.  
- Award partial credit for "near" matches (e.g. misspelled badges/models).

#### 5. **Parallel Request Handling**

- **Client-side concurrency**: fire multiple `/match` calls at once (e.g. via `Promise.all`) so the test runner or frontend makes full use of available network and CPU.
- **Server-side clustering**: run multiple Node.js workers (using the built-in `cluster` module or PM2 in cluster mode) so the app can handle requests in parallel across all CPU cores.

#### 6. **Metrics & Observability**

- Instrument latency, cache hit/miss rates, error counts, etc.  
- Expose a `/metrics` or `/stats` endpoint for real-time monitoring and alerts.

#### 7. **Advanced Auth for Admin Endpoint**

- Replace the static API key with short-lived JWTs or OAuth2.
- Enhance access control around `/admin/cache/reload`.

#### 8. **Graceful Scale-Out**  

- For multiple instances, use a distributed cache (e.g. Redis).
- Use a simple distributed lock (e.g. Redis `SETNX` with a TTL) to ensure only one instance refreshes at a time.  

#### 9. **Testing**

    - Unit tests for parser.ts and matcher.ts using Jest or similar.
    - Integration test for the /match endpoint (mock or embedded Postgres).

### Security Considerations

#### 1. **Authentication & Authorization**  

- Protect sensitive endpoints (`/admin/cache/reload`, `/metrics`) with strong auth (API Keys, JWTs, OAuth2).  
- Enforce least‐privilege: only allow reloads from trusted roles/users.

#### 2. **Rate Limiting & Throttling**  

- Use middleware like `express-rate-limit` to cap requests per IP or API key.  
- Apply stricter limits on `/match` and especially admin routes to prevent abuse.

#### 3. **Input Validation & Sanitization**  

- Validate `description` payloads (e.g. length, character whitelist) before parsing.  
- Sanitize any user‐supplied strings to avoid injection attacks (SQL, regex‐DoS).

#### 4. **Secure HTTP Headers**  

- Use `helmet` to set HSTS, XSS protection, Content Security Policy, etc.
- Disable unnecessary headers (`X-Powered-By`).

#### 5. **CORS Policy**  

- Restrict `Access-Control-Allow-Origin` to known frontends or tooling origins.  
- Only allow needed methods (`GET`, `POST`) and headers.

#### 6. **Transport Security (TLS)**  

- Terminate HTTPS at the proxy/load-balancer (e.g. Envoy, Nginx, Cloud LB).
- Redirect all HTTP traffic to HTTPS.

#### 7. **Secrets Management**  

- Never commit `.env` or secrets to Git. 
- Consider a vault (Vault, AWS Secrets Manager) for production secrets.  
- Rotate `ADMIN_TOKEN`, database credentials, and JWT signing keys periodically.

#### 8. **Logging & Audit Trails**  

- Log all admin actions (cache reloads) with timestamps and caller identity.
- Retain logs in a centralized system (ELK, Loki) for forensic analysis.

#### 9. **Dependency & Vulnerability Scanning**  

- Regularly run `npm audit` or third-party tools (Snyk, Dependabot) to catch CVEs.
- Keep `express`, `prisma`, and other critical libs up to date.

#### 10. **Deployment Hardening**  

- Run containers as non‐root users.
- Minimize container image footprint.
- Scan container images for vulnerabilities.
