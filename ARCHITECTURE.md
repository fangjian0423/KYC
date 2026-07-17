# Architecture — Intelligent KYB / UBO Verification

> This document describes the overall architecture, data flow, component
> responsibilities, and the parts that are **not yet done**.
> Intended for team discussion and future work.

---

## 1. Overview

A KYB (Know Your Business) / UBO (Ultimate Beneficial Owner) verification tool: a
compliance analyst uploads a corporate document, and the system automatically runs
**document extraction → registry verification → consistency comparison**, producing a
confidence score and flagged discrepancies.

Core idea: **the code handles "orchestration and execution", while the AI agents on
Foundry handle "understanding and judgement".**

---

## 2. Layered architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend  (React + Vite + Tailwind)                            │
│    · case list / document upload / trigger verify / results     │
└───────────────────────────────┬─────────────────────────────────┘
                                 │ REST (JSON / multipart)
┌───────────────────────────────▼─────────────────────────────────┐
│  Backend  (Node.js + Express)  —— "orchestration + execution"    │
│                                                                 │
│   routes/cases.ts     REST API: list / get / create / verify    │
│   db/*                case persistence (Mock / SQLite / Cosmos) │
│   foundry/                                                       │
│     client.ts         AIProjectClient (DefaultAzureCredential)  │
│     orchestrator.ts   the 3-step pipeline (see §4)              │
│     agents.ts         definitions of the 3 prompt agents        │
│     tools.ts          registry function tool (for the UBO agent)│
│     registryClient.ts registry HTTP call + auto token exchange  │
│     routines.ts       Routine provisioning                      │
│     tracing.ts        OpenTelemetry / App Insights              │
│     provision.ts      idempotent platform provisioning          │
└──────┬───────────────────────────────────────────┬──────────────┘
       │ Foundry Agents SDK                         │ HTTPS
┌──────▼──────────────────────────────┐    ┌────────▼───────────────┐
│  Microsoft Foundry platform         │    │  openapi.it registry   │
│    kyc-extraction-agent  (prompt)   │    │  (test.company.*)      │
│    kyc-ubo-registry-agent(prompt+fn)│    │  company / UBO data    │
│    kyc-comparison-agent  (prompt)   │    └────────────────────────┘
│    kyc-perpetual-review  (routine)  │
└─────────────────────────────────────┘
```

---

## 3. Key concept: code vs agent responsibilities

There are two kinds of "executors" in the system, with strictly separated duties:

| Responsibility | Who | Notes |
| --- | --- | --- |
| Sequencing (A then B then C) | ⚙️ Code | orchestrator |
| Persistence, case status updates | ⚙️ Code | repositories |
| HTTP call to registry, token exchange/refresh | ⚙️ Code | registryClient |
| **Read company name / reg. number from the image** | 🧠 Agent A | multimodal vision |
| **Decide whether to call the registry, with what args** | 🧠 Agent B | tool-call decision |
| **Understand registry JSON, normalize ownership** | 🧠 Agent B | semantic parsing |
| **Judge whether the two sides match, assign a score** | 🧠 Agent C | fuzzy judgement |

> In one line: **the agents decide "what to do / what to look up / what it means", and
> the code handles "how to execute and how to wire the data together".**
> Without the agents, the code is just an empty pipeline; without the code, the agents
> cannot make HTTP calls, manage credentials, or persist data.

---

## 4. Data flow

### 4.1 Create a case — `POST /api/cases`

```
frontend form (company / country / VAT / docType + image)
   → multer parses multipart
   → image → base64 data URL, stored in CaseDocument.imageDataUrl
   → repository.createCase(...)  status = SUBMITTED
   → return case (base64 stripped from responses to keep them lean)
```

### 4.2 Verify — `POST /api/cases/:id/verify`

```
orchestrator.runVerification(caseId)              [trace: kyc.verify]
│
├─ Step A  Extraction                             [trace: kyc.extraction]
│    code  → sends the document image as input_image to Agent A
│    🧠 Agent A reads the image → { legalName, registrationNumber, docType, shareholders }
│    code  → store extractedData, status = EXTRACTION_COMPLETE
│
├─ Step B  UBO Registry                           [trace: kyc.ubo_registry]
│    code  → sends { countryCode, registrationNumber } to Agent B
│    🧠 Agent B decides to query the registry → emits function_call(query_openapi_registry, args)
│    ⚙️ code (registryClient) executes:
│         · exchange/obtain a short-lived token from the API key
│           (cached, auto-refreshed before expiry, retried once on 401)
│         · GET registry → raw JSON
│    code  → feeds the JSON back to Agent B
│    🧠 Agent B normalizes → { registryName, taxCode, shareholders }
│    code  → store uboRegistryData, status = UBO_COMPLETE
│    (on failure, degrades gracefully to registryName: "UNAVAILABLE"; pipeline never crashes)
│
├─ Step C  Comparison                             [trace: kyc.comparison]
│    code  → sends { extracted, registry } to Agent C
│    🧠 Agent C → { matchScore, discrepancies[] }
│    code  → store comparisonResults
│    status = VERIFIED (no discrepancies) or DISCREPANCY_FOUND
│
└─ return case + traceId
```

**Case state machine**:
`SUBMITTED → EXTRACTION_COMPLETE → UBO_COMPLETE → VERIFIED | DISCREPANCY_FOUND`

---

## 5. Foundry platform resources (created idempotently by `npm run provision`)

| Resource | kind / type | Purpose |
| --- | --- | --- |
| `kyc-extraction-agent` | prompt agent | multimodal vision extraction |
| `kyc-ubo-registry-agent` | prompt agent + function tool | registry verification (decision + parsing) |
| `kyc-comparison-agent` | prompt agent | consistency comparison and scoring |
| `kyc-perpetual-review` | Routine | weekly cron re-verification (perpetual KYC) |

**Platform features used (challenge requires ≥ 2)**: Prompt agents · Tracing · Routines.
(We also evaluated **Toolboxes** and removed it — see `FRICTION_LOG.md`.)

> **Where is the "tool"?** The registry tool (`query_openapi_registry`) is **not a
> standalone platform resource** — it is embedded in the UBO agent's definition
> (`kyc-ubo-registry-agent`, under its `tools`). The portal has no top-level Tools or
> Toolboxes list; to see it, open the UBO agent (version 2) and look at its Tools /
> Functions section.

---

## 6. Key design decisions

1. **Registry uses a function tool, not the Foundry OpenAPI tool.**
   The registry needs an API-key → short-lived-token exchange, which the Foundry OpenAPI
   tool's auth (anonymous / project_connection / managed_identity) cannot perform. Using
   a function tool keeps execution in our code, with fully automatic token management.

2. **Orchestration is code, not a Foundry Workflow.**
   A Workflow runs on the platform and cannot execute our token-management code. See
   `FRICTION_LOG.md` → "Workflow agents (evaluated, not adopted)".

3. **Auth via `DefaultAzureCredential`.**
   `az login` locally; seamless switch to Managed Identity in the cloud, no code change,
   no secrets in the repo.

4. **Pluggable repository layer** (Mock / SQLite / Cosmos), selected by env vars.

---

## 7. Not yet done / TODO

> The following are currently **missing or unverified**, for team planning.

### 7.1 Deployment (not started) (Zhihao) - ACA
- [ ] **Containerize the backend**: `server/` currently has **no Dockerfile** (the
      frontend already has one).
- [ ] **Deploy to Azure Container Apps**: backend + frontend on ACA. The frontend's
      `VITE_BACKEND_API_URL` is injected at build time, so the backend's public URL must
      exist first.
- [ ] **Switch auth to Managed Identity**: assign the Foundry project RBAC role to the
      ACA app (code already compatible, no change needed).
- [ ] **Secrets management**: `REGISTRY_API_KEY` / `REGISTRY_EMAIL` etc. as ACA secrets
      or in Key Vault.

### 7.2 Observability (partly done) (Zhihao)
- [x] In-code OpenTelemetry spans (kyc.verify / extraction / ubo_registry / comparison).
- [ ] **Connect Application Insights**: set `APPLICATIONINSIGHTS_CONNECTION_STRING` (or
      connect App Insights to the project in the portal) so traces are visible and
      demoable.

### 7.3 Data & persistence(Zhihao) - cosmos
- [ ] **Finalize the database choice**: the demo uses the in-memory mock (cleared on
      restart); `better-sqlite3` has no prebuilt binary on Node v26; production should use
      **Cosmos DB** (already supported — just set the connection string).
- [ ] **Real document storage**: uploaded images are kept in memory / placeholder
      blobUrl; production should store to **Azure Blob Storage** and pass the blob
      reference to the vision step.

### 7.4 Business logic (optional)
- [ ] **Multi-document / deep ownership**: only the first document is processed today; no
      multi-document aggregation or layered shareholder drill-down.

### 7.5 UBO Registry Abstraction (Sean)

- openapi
- a
- b


---

## 8. References

- `README.md` — quick start, environment variables, run steps, test data
- `FRICTION_LOG.md` — per-feature platform feedback (incl. the Workflow limitation)
- `server/src/foundry/` — all Foundry integration code
