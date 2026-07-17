# Intelligent KYB / UBO Case Management — Microsoft Foundry Agents PoC

An internal back-office tool that helps compliance analysts run **Know Your Business
(KYB)** and **Ultimate Beneficial Owner (UBO)** verification. An analyst uploads a
corporate document; a multi-agent pipeline on the **Microsoft Foundry Agents platform**
extracts the entity details from the document (vision), verifies ownership against an
external corporate registry, compares the two, and flags discrepancies — reducing the
manual, fragmented handoffs that define KYC operations today.

Built for the Foundry Agents hackathon. See [`FRICTION_LOG.md`](./FRICTION_LOG.md) for
feature-specific platform feedback.

---

## What actually runs where

The three verification agents and the routine **already live on the Foundry platform**
(created via `npm run provision`). What runs locally is our **orchestration backend +
React frontend**, which call those Foundry agents.

```
┌─ Local / self-hosted ───────────────┐      ┌─ Microsoft Foundry platform ──────┐
│  React frontend (Vite)              │      │  kyc-extraction-agent (vision)    │
│  Express backend                    │      │  kyc-ubo-registry-agent (+tool)   │
│   • orchestration (3-step pipeline) │──────▶  kyc-comparison-agent             │
│   • registry token auto-management  │      │  kyc-perpetual-review (routine)   │
│   • case persistence (SQLite/Cosmos)│      │                                   │
└──────────────────────────────────────┘      └───────────────────────────────────┘
```

### The verify pipeline (`POST /api/cases/:id/verify`)

```
orchestrator.runVerification()                    [trace span: kyc.verify]
  ├─ A. Extraction  agent (multimodal)            [span: kyc.extraction]
  │       reads legalName / registrationNumber from the uploaded document IMAGE
  ├─ B. UBO         agent + function tool          [span: kyc.ubo_registry]
  │       query_openapi_registry  → executed in our code (registryClient.ts)
  │            → auto-exchanges API key for a short-lived token, caches & refreshes
  │            → calls the corporate registry, returns ownership data
  └─ C. Comparison  agent                          [span: kyc.comparison]
          compares extracted vs registry → match score + discrepancies
```

Case status advances `SUBMITTED → EXTRACTION_COMPLETE → UBO_COMPLETE →
VERIFIED | DISCREPANCY_FOUND`.

---

## Foundry platform features used (challenge requires ≥ 2)

| Feature | How we use it | Status |
| --- | --- | --- |
| **Prompt agents** | 3 declarative agents (extraction / UBO / comparison) via `agents.createVersion` | ✅ working |
| **Tracing** | OpenTelemetry spans around every step; exports to App Insights when configured | ✅ code ready · ⚠️ App Insights not yet connected |
| **Routines** | `kyc-perpetual-review` — weekly cron re-verifies entities (perpetual KYC watchdog) | ✅ working |

> We also evaluated **Toolboxes** and removed it (catalog-only at our scale, no
> agent↔toolbox binding) — see `FRICTION_LOG.md`.

---

## Repository layout

```
client/                 React + Vite + Tailwind frontend
server/
  src/
    index.ts            Express app entry (inits tracing)
    routes/cases.ts     REST API: list / get / create(upload) / verify
    db/                 Repositories: Mock (in-memory) · SQLite · Cosmos
    foundry/
      client.ts         AIProjectClient (DefaultAzureCredential)
      agents.ts         3 prompt-agent definitions
      tools.ts          registry function tool (for the UBO agent)
      routines.ts       perpetual-KYC routine provisioning
      registryClient.ts registry client + automatic API-key→token exchange/refresh
      orchestrator.ts   the 3-step verify pipeline
      tracing.ts        OpenTelemetry / App Insights setup
      provision.ts      `npm run provision` — idempotent platform setup
specs/                  original design specs
FRICTION_LOG.md         hackathon friction log (per-feature feedback)
```

---

## Prerequisites

- Node.js LTS (note: `better-sqlite3` has no prebuilt binary on Node v26 yet — use
  `USE_MOCK_DB=true` or Cosmos until this is resolved)
- Azure CLI, logged in: `az login` (the subscription containing the Foundry project
  must be the default). Auth uses `DefaultAzureCredential` — no keys in code.
- A Foundry project with a chat model deployment.
- (For live registry data) an openapi.it **Sandbox** API key — see below.

---

## Environment variables (`server/.env`)

```env
# Foundry
FOUNDRY_PROJECT_ENDPOINT=https://<your>.services.ai.azure.com/api/projects/<proj>
FOUNDRY_MODEL_NAME=gpt-5.4

# Database (unset COSMOS_* to fall back to SQLite; USE_MOCK_DB=true for in-memory)
# COSMOS_CONNECTION_STRING=...
USE_MOCK_DB=true

# Corporate registry (openapi.it) — auto-managed token, no manual rotation
REGISTRY_API_KEY=<sandbox api key>
REGISTRY_EMAIL=<your openapi.it account email>
# Optional overrides (sensible sandbox defaults are built in):
# REGISTRY_TOKEN_ENDPOINT=https://test.oauth.openapi.it/token
# REGISTRY_BASE_URL=https://test.company.openapi.com
# REGISTRY_SCOPE=GET:test.company.openapi.com/WW-start

# Tracing (optional) — connect App Insights to see traces
# APPLICATIONINSIGHTS_CONNECTION_STRING=...

# Protected platform operations
PLATFORM_ADMIN_KEY=<random high-entropy operator access code>
REGISTRY_ALLOWED_HOSTS=test.company.openapi.com,company.openapi.com

# Allowlisted Azure deployment profile (optional)
# DEPLOYMENT_ENABLED=true
# AZURE_SUBSCRIPTION_ID=<approved subscription UUID>
# AZURE_SUBSCRIPTION_NAME=<friendly display name>
# AZURE_RESOURCE_GROUP=<approved resource group>
# AZURE_ACR_NAME=<existing ACR name>
# DEPLOYMENT_LOCATION=westus3
# DEPLOYMENT_NAME_PREFIX=kyc
# DEPLOYMENT_BACKEND_IMAGE=<approved backend image>
# DEPLOYMENT_FRONTEND_IMAGE=<approved frontend image>
```

Frontend (`client/.env.local`): `VITE_BACKEND_API_URL=http://127.0.0.1:5000`
(use `127.0.0.1`, not `localhost`, to avoid a WSL port-relay conflict on Windows).

---

## Running locally

```bash
# 1. Install
cd server && npm install
cd ../client && npm install

# 2. Provision Foundry resources (agents, routine) — idempotent
cd ../server && npm run provision

# 3. Smoke-test connectivity (optional)
npm run smoke

# 4. Start backend and frontend (two terminals)
npm run dev                     # backend on :5000
cd ../client && npm run dev     # frontend on :5173
```

Open **http://localhost:5173**, create a case, and click **Verify**.

### Registry Studio and Deployment Center

The two administration pages use real backend APIs under `/api/platform`:

- Registry Studio reads and writes the active connector configuration in the
  `PlatformConfig` Cosmos container. A live connection test performs an actual
  sandbox lookup, and every subsequent UBO tool call resolves the saved base URL
  and field mappings.
- Deployment Center starts a persisted asynchronous ARM deployment using the
  versioned template compiled from `infra/main.bicep`. The browser cannot supply a
  subscription, resource group, image, template, or command; those values come from
  the server-side allowlisted profile.

Mutating operations require `PLATFORM_ADMIN_KEY` in the `x-platform-admin-key`
header. The UI keeps this operator access code only in component memory. In Azure,
the backend Managed Identity needs `Contributor` only on the approved deployment
resource group. A `ReadOnly` resource lock intentionally blocks deployment; an Azure
operator must remove it before starting a job and restore it afterwards.

### Test data (openapi.it sandbox)

VAT / registration numbers that return real sandbox data:

| VAT | Company | Country |
| --- | --- | --- |
| `DE132490588` | adidas AG | DE |
| `DE811115368` | AUDI | DE |
| `DE119429301` | Henkel | DE |
| `12485671007` | OPENAPI SRL | IT |

- Upload a document image that **shows** the company name/VAT → extraction reads it →
  matches registry → `VERIFIED`.
- Upload a random image → extraction returns `UNKNOWN` → mismatch → `DISCREPANCY_FOUND`.

### Getting a sandbox API key

1. Register at <https://console.openapi.com> (free), switch to **Test / Sandbox** mode.
2. Activate the **Company / Visura** API.
3. Copy the **Sandbox API Key** (long-lived) → `REGISTRY_API_KEY`. Our code exchanges it
   for short-lived tokens automatically (cached + refreshed; verified: 5 calls = 1
   token exchange).

---

## Current status (2026-07)

**Working end-to-end, verified against the real Foundry project (`gpt-5.4`):**
- ✅ 3 prompt agents deployed and orchestrated
- ✅ Multimodal (vision) extraction — the uploaded document genuinely drives the result
- ✅ UBO agent calls the registry via a function tool; **live** sandbox data returned
- ✅ Automatic registry token exchange / caching / refresh (no manual rotation)
- ✅ Routine provisioned on the platform (perpetual-KYC watchdog)
- ✅ Tracing spans in code; `traceId` returned from `/verify`
- ✅ Graceful degradation when the registry is unavailable (`UNAVAILABLE` + WARNING)

**Not yet done / known gaps:**
- ⚠️ **App Insights not connected** → traces are local-only. Set
  `APPLICATIONINSIGHTS_CONNECTION_STRING` (or connect App Insights to the project) to
  see traces. (The new Foundry portal's Tracing tab was hard to locate.)
- ⚠️ **`better-sqlite3` on Node v26** has no prebuilt binary → demo runs with
  `USE_MOCK_DB=true` (in-memory; cleared on restart). Use Cosmos or an older Node for
  persistence.
- ⚠️ The **VAT / registration number is entered by the analyst** and used for the
  registry lookup. Optionally we could make the UBO lookup use the number extracted
  from the document instead (fully document-driven).
- ⚠️ Not committed / not deployed — currently on the `develop` branch, run locally.

---

## Open decisions for team discussion (TODO)

1. **Deployment target.** Options discussed:
   - **A — Azure Container Apps**: containerize the backend + frontend, keep agents on
     Foundry. Standard cloud path. Auth via **Managed Identity** (assign the Foundry
     RBAC role) instead of `az login`; secrets in env/Key Vault; DB → Cosmos.
     *Adds no new Foundry platform feature — it's just hosting.*
   - **B — Hosted Agents (Foundry feature)**: package the **verify orchestration** as a
     managed hosted agent on the platform. Directly fulfils the challenge's "deploy on
     the platform instead of self-hosting" framing and adds a 4th platform feature +
     rich friction-log material. **Note:** a hosted agent hosts *agent logic only* —
     the **React frontend still needs separate static hosting** (Static Web Apps /
     Storage / nginx), and a **thin backend** is still needed for CRUD + file upload.
     Best done stateless (hosted agent returns results; thin backend persists).

2. **Add a 4th platform capability?** For more hackathon coverage + friction feedback:
   - **Hosted Agents** (see B above) — highest impact, most effort.
   - **Skills** — wrap "registry verification" as a reusable Skill on the UBO agent;
     low risk, barely touches the architecture.
   - **Agent Optimization** — eval-driven prompt/config tuning with before/after
     quality/cost numbers.

3. **Observability.** Connect an Application Insights resource so the Tracing feature
   produces visible, demoable traces (one complex run walkthrough for the demo).

4. **Registry auth for production.** Sandbox → production means a paid openapi.it key
   and the production domain/scope. Token management already handles rotation.

5. **Persistence.** Decide SQLite (fix Node version) vs Cosmos DB for the demo/prod DB.

6. **Real document storage.** Uploaded images are currently kept in-memory / as a
   placeholder `blobUrl`. For production, store to Azure Blob Storage and pass the blob
   reference to the vision step.

---

## Notes

- Everything authenticates via `DefaultAzureCredential`; no secrets are committed.
- `server/.env` is git-ignored. Never commit API keys.
