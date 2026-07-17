import { getProjectClient, foundryConfig } from './client';
import { registryFunctionTool } from './tools';

/**
 * Declarative "prompt agents" for the KYB verification pipeline. Each is created
 * on the Foundry platform as a named, versioned agent. The orchestrator then
 * references them by name through the Responses API.
 */
export const AGENT_NAMES = {
  extraction: 'kyc-extraction-agent',
  ubo: 'kyc-ubo-registry-agent',
  comparison: 'kyc-comparison-agent',
} as const;

const EXTRACTION_INSTRUCTIONS = `
You are a KYB document-extraction agent. You may be given a document IMAGE together
with some context, or just context text. When an image is provided, read the fields
directly from the image; never invent values that are not present.

Produce a normalized JSON object describing the entity. Respond with ONLY a JSON
object, no prose, no code fences, matching exactly:
{
  "registrationNumber": string,   // national registration / tax / VAT number as printed
  "legalName": string,            // the company legal name as printed
  "documentTypeIdentified": "PASSPORT" | "BUSINESS_REGISTRATION" | "BANK_STATEMENT",
  "shareholders": [ { "name": string, "equityPercentage": number } ]
}
If a value cannot be found (or the image is not a corporate document), use the string
"UNKNOWN" for text fields and an empty array for shareholders. Do not guess.
`.trim();

const UBO_INSTRUCTIONS = `
You are a UBO (Ultimate Beneficial Owner) registry-verification agent. You are given
an ISO country code and a corporate registration number. Call the
"query_openapi_registry" function tool with those two arguments to fetch the official
registry profile, then summarise the entity and its ownership structure from the
returned data.

Respond with ONLY a JSON object, no prose, no code fences, matching exactly:
{
  "registryName": string,
  "taxCode": string,
  "shareholders": [ { "name": string, "equityPercentage": number } ]
}
Derive "registryName" from the registry source/company data, "taxCode" from the
registry's vatCode/companyNumber (fall back to the supplied registration number), and
list any shareholders returned. If the tool returns no shareholders, use an empty array.
If the registry call fails or returns no data, set "registryName" to "UNAVAILABLE",
"taxCode" to the supplied registration number, and "shareholders" to an empty array.
Never invent registry data.
`.trim();

const COMPARISON_INSTRUCTIONS = `
You are a KYB comparison agent. You are given two JSON objects: "extracted" (from the
uploaded document) and "registry" (from the official registry). Compare the identity
fields and shareholder ownership structures, list any discrepancies with clear
explanations, and compute a 0-100 confidence match score (100 = perfect match).

Respond with ONLY a JSON object, no prose, no code fences, matching exactly:
{
  "matchScore": number,
  "summary": string,
  "discrepancies": [
    {
      "field": string,
      "extractedValue": string,
      "registryValue": string,
      "severity": "CRITICAL" | "WARNING",
      "description": string
    }
  ]
}

Rules:
- "summary": 1-3 sentences in plain language explaining the overall outcome — why the
  score is what it is, whether the entity is verified, and the main concern if any.
  Even when the score is high (e.g. 90-99), clearly state what prevented a perfect 100.
- For EACH discrepancy, "description" MUST explain (a) exactly what differs between the
  document and the registry, and (b) why it matters for KYB (e.g. "legal name differs:
  document shows a trade name while the registry shows the full legal form 'AG', which
  is a minor formatting difference, not a red flag").
- Severity: use "CRITICAL" for mismatches that could indicate fraud or the wrong entity
  (different company, different registration number, conflicting ownership); use
  "WARNING" for minor/formatting differences (legal-form suffixes, abbreviations,
  missing optional data).
- If everything matches, return matchScore 100, an empty "discrepancies" array, and a
  "summary" confirming the entity is fully verified.
- Treat missing/unavailable registry data as a single WARNING discrepancy (field
  "registryDataAvailability") whose description explains the registry could not be
  reached, not a crash.
`.trim();

interface AgentSpec {
  name: string;
  definition: Record<string, unknown>;
}

function agentSpecs(): AgentSpec[] {
  return [
    {
      name: AGENT_NAMES.extraction,
      definition: {
        kind: 'prompt',
        model: foundryConfig.model,
        instructions: EXTRACTION_INSTRUCTIONS,
      },
    },
    {
      name: AGENT_NAMES.ubo,
      definition: {
        kind: 'prompt',
        model: foundryConfig.model,
        instructions: UBO_INSTRUCTIONS,
        tools: [registryFunctionTool()],
      },
    },
    {
      name: AGENT_NAMES.comparison,
      definition: {
        kind: 'prompt',
        model: foundryConfig.model,
        instructions: COMPARISON_INSTRUCTIONS,
      },
    },
  ];
}

/**
 * Create (or add a new version of) every pipeline agent on the platform.
 * `createVersion` provisions the agent if it does not yet exist, so this is
 * safe to run repeatedly during provisioning.
 */
export async function ensureAgents(): Promise<void> {
  const project = getProjectClient();
  for (const spec of agentSpecs()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const version = await project.agents.createVersion(spec.name, spec.definition as any);
    console.log(`[agents] ensured '${spec.name}' (version ${version.version})`);
  }
}
