# Foundry Agents Platform — Friction Log

**Team scenario:** Intelligent KYB / UBO case-management agent — an internal
back-office tool that extracts data from corporate onboarding documents, verifies
ownership against a corporate registry, and flags discrepancies for a compliance
analyst.

**Platform features exercised (3):** Toolboxes · Tracing · Routines
(plus Prompt Agents as the agent-authoring model).

**SDK:** `@azure/ai-projects@2.3.0` (Node.js / TypeScript), auth via
`DefaultAzureCredential` (`az login`). Model deployment: `gpt-5.4`.

---

## Architecture as built

```
POST /api/cases/:id/verify
   └─ orchestrator.runVerification()          [span: kyc.verify]
        ├─ Extraction  prompt agent            [span: kyc.extraction]
        ├─ UBO         prompt agent            [span: kyc.ubo_registry]
        │     └─ query_openapi_registry  (function tool, executed in our code)
        │           └─ registryClient: API key → short-lived token → registry
        └─ Comparison  prompt agent            [span: kyc.comparison]

Provisioning (npm run provision):
   • toolboxes.createVersion("kyc-registry-toolbox", [openapi tool], {metadata,…})
   • agents.createVersion x3 (extraction / ubo / comparison)
   • beta.routines.createOrUpdate("kyc-perpetual-review", schedule→invoke ubo)

Scheduled watchdog (Routine): weekly cron → re-invoke UBO agent (perpetual KYC)
```

Each step is a self-contained agent run; our OpenTelemetry spans wrap them into one
trace. The registry Toolbox packages the API spec for governance/discovery, while
execution flows through a function tool so our code can manage the registry's
API-key→token exchange automatically.

---

## Feature 1 — Toolboxes

**What we did:** Packaged the corporate-registry OpenAPI endpoint into a curated,
versioned `kyc-registry-toolbox` via `project.toolboxes.createVersion(name, tools, {
description, metadata, policies })`, carrying governance metadata
(`domain`, `owner`, `dataClassification`). Exercised discovery with
`toolboxes.list()` / `getVersion()`.

### What worked
- `createVersion` is genuinely idempotent-friendly: it **provisions the toolbox if
  it doesn't exist** and otherwise adds a new version — so the same provisioning
  script is safe to re-run. Great DX.
- Versioning is first-class: every `createVersion` returns a `ToolboxVersionObject`
  with an incrementing `version`, and `list()` surfaces `default_version`. This maps
  cleanly onto "curated, governed tool collection".
- Attaching the same `OpenApiFunctionDefinition` to both the toolbox and the agent
  worked without redefinition (shared factory in `tools.ts`).

### What was confusing
- **Toolboxes and agents feel disconnected.** There is **no way to attach a toolbox
  to an agent** in the agent definition — `PromptAgentDefinition` only accepts
  `tools: ToolUnion[]`, not a toolbox reference. So a toolbox today is a *catalog /
  governance* construct, not something the agent runtime consumes directly. We had
  to duplicate the tool: once in the toolbox (for governance) and once inline on the
  UBO agent (for execution). We expected `tools: [{ type: "toolbox", name: "…" }]`
  or similar.
- The `policies` parameter (`ToolboxPolicies`) is typed but under-documented — it
  was unclear what policy shapes are enforced vs. advisory, so we left it minimal.
- No `foundryFeatures` opt-in flag is required for toolboxes (unlike routines),
  which was pleasant but inconsistent with the other preview surfaces.

### What blocked us
- Nothing hard-blocked. The main limitation is the missing agent↔toolbox binding,
  which weakens the "governance actually gates what the agent can call" story.

---

## Feature 2 — Tracing / Observability

**What we did:** Wrapped the orchestration in OpenTelemetry spans
(`kyc.verify` → `kyc.extraction` / `kyc.ubo_registry` / `kyc.comparison`) via a
small `withSpan()` helper, initialised Azure Monitor with `useAzureMonitor()` when
`APPLICATIONINSIGHTS_CONNECTION_STRING` is set, and surfaced the W3C `traceId` in the
`/verify` API response for a one-click demo walkthrough.

### What worked
- The SDK auto-instruments agent runs and tool calls once Azure Monitor is wired, so
  our **custom spans nest under the same trace** as the platform's agent spans — a
  single verification produces one connected trace across three agents. This is
  exactly the "trace walkthrough of one complex run" the challenge asks for.
- Content recording is a single env toggle
  (`AZURE_TRACING_GEN_AI_CONTENT_RECORDING_ENABLED=true`), so prompts/outputs show up
  on spans without code changes.
- Correlating the returned `traceId` to the Foundry portal (Agents ▸ Traces) made the
  demo trivial to narrate.

### What was confusing
- **Two overlapping mechanisms**: `@azure/monitor-opentelemetry` (`useAzureMonitor`)
  vs. the SDK's own `telemetry` operations vs. raw OpenTelemetry. It took reading the
  SDK README *and* the tracing how-to to understand that `useAzureMonitor()` is the
  intended entry point and everything else auto-correlates.
- Whether content recording is on by default vs. opt-in differs between docs; we set
  the env var explicitly to be safe.

### What blocked us
- Nothing blocked. Only setup ordering matters: tracing must be initialised **before**
  the app imports the agent code, so we call `initTracing()` as the first import in
  `index.ts`. This wasn't obvious and is easy to get subtly wrong.

---

## Feature 3 — Routines

**What we did:** Created `kyc-perpetual-review` via
`project.beta.routines.createOrUpdate(name, { foundryFeatures: "Routines=V1Preview",
triggers: { weeklyReview: { type: "schedule", cron_expression, time_zone } },
action: { type: "invoke_agent_responses_api", agent_name, input } })` — a scheduled
"perpetual KYC" watchdog that re-invokes the UBO agent on a weekly cron to detect
ownership changes, with no always-on server.

### What worked
- `createOrUpdate` is a clean idempotent upsert keyed by name — re-running
  provisioning just updates the definition.
- The trigger/action model is expressive: `ScheduleRoutineTrigger` (cron + timezone),
  `TimerRoutineTrigger`, `GitHubIssueRoutineTrigger`, `CustomRoutineTrigger`, and
  actions for both the Responses and Invocations APIs. Cron + agent-invoke covered our
  perpetual-KYC use case perfectly.
- `list()` / `enable()` / `disable()` / `dispatch()` gave us everything needed to
  manage and *manually test-fire* a scheduled routine without waiting for the cron.

### What was confusing
- **`triggers` is a `Record<string, RoutineTriggerUnion>` (a keyed map), but "v1
  supports exactly one trigger".** A map that must have exactly one entry is an odd
  shape — the key (`"weeklyReview"`) is arbitrary and its purpose is unclear.
- The **`foundryFeatures: "Routines=V1Preview"` opt-in must be passed on *every*
  routine call** (create, list, get, enable…). Forgetting it on `list()` is an easy
  trap. Toolboxes need no such flag, so the inconsistency surprised us.
- `InvokeAgentResponsesApiRoutineAction` has both `agent_name` and
  `agent_endpoint_id` (and `input` is `any`) — it wasn't obvious which to use for a
  prompt agent vs. a hosted agent, or how the routine's output is surfaced/stored.

### What blocked us
- We could not fully validate the *actual scheduled firing* within the hackathon
  window (weekly cron); we exercised the definition + `list` + could `dispatch` to
  test-fire, but end-to-end "it ran on schedule and reported" needs a longer horizon.

---

## Cross-cutting friction

1. **README samples were stale vs. the live service.** The published README shows
   `responses.create(..., { body: { agent: { name, type: "agent_reference" } } })`,
   but the service now rejects that with
   *"The 'agent' property is deprecated. Use 'agent_reference' instead."* The correct
   shape is `{ body: { agent_reference: { name, type: "agent_reference" } } }` (found
   only in `samples-dev`). Docs and the shipped README should be regenerated together.

2. **OpenAPI tool auth can't handle a token-exchange flow → we used a function tool.**
   The Foundry OpenAPI tool auth is limited to `anonymous`, `project_connection`,
   `managed_identity`. Our registry (openapi.it) uses a **two-tier** credential model:
   a long-lived API key that must be exchanged (HTTP Basic `email:apiKey`) for a
   **short-lived** access token, which is then sent as `Authorization: Bearer …`.
   None of the built-in auth types can perform that exchange, and a static token in a
   connection would expire and need manual rotation. With `anonymous` the tool returns
   **403** and **hard-fails the whole response** (surfaced as an HTTP 400
   `ValidationError`, not a tool result the agent can reason about).
   **Resolution:** we exposed the registry as a **function tool** and execute it in our
   own code (`registryClient.ts`), which transparently exchanges the API key for a token,
   caches it, refreshes before expiry, and retries once on 401 — fully automatic, no
   manual rotation. Two platform asks remain: (a) first-class support for API-key /
   token-exchange auth on the OpenAPI tool, and (b) let non-2xx OpenAPI tool responses
   flow back to the agent as data so it can degrade instead of aborting the run.

3. **`node v26` + `better-sqlite3`** had no prebuilt binary (unrelated to Foundry) —
   we run the demo with the in-memory repository (`USE_MOCK_DB=true`).

---

## Net take

Standing up **three real prompt agents + a governed toolbox + a scheduled routine +
end-to-end tracing** on the platform took well under a day with the TypeScript SDK,
and the idempotent `createVersion` / `createOrUpdate` provisioning story is excellent.
The biggest rough edges were **stale published samples**, the **missing agent↔toolbox
binding**, and **OpenAPI tool auth not supporting token-exchange flows** — each cost
real debugging time and are the highest-leverage fixes for the platform.
