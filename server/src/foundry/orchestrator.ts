import { getOpenAIClient } from './client';
import { AGENT_NAMES } from './agents';
import { REGISTRY_TOOL_NAME } from './tools';
import { queryRegistry, isRegistryConfigured } from './registryClient';
import { withSpan, currentTraceId } from './tracing';
import { getRepository } from '../db/repositoryFactory';
import { resolveImageDataUrl } from '../storage/blobClient';
import type { Case, ExtractedData, UboRegistryData, ComparisonResults } from '../types';

export interface VerificationResult {
  case: Case;
  traceId?: string;
}

/** Extract the first JSON object from an LLM response, tolerating code fences/prose. */
function parseJsonObject<T>(raw: string): T {
  const fenced = raw.replace(/```(?:json)?/gi, '').trim();
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Agent did not return JSON. Raw output: ${raw.slice(0, 300)}`);
  }
  return JSON.parse(fenced.slice(start, end + 1)) as T;
}

/** Run a single prompt agent (no tools) and return its text output. Optionally
 * includes an image for multimodal (vision) extraction. */
async function runAgent(
  agentName: string,
  input: string,
  imageDataUrl?: string,
): Promise<string> {
  const openai = getOpenAIClient();
  const content = imageDataUrl
    ? [
        { type: 'input_text', text: input },
        { type: 'input_image', image_url: imageDataUrl },
      ]
    : input;
  const response = await openai.responses.create(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { input: [{ type: 'message', role: 'user', content }] } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { body: { agent_reference: { name: agentName, type: 'agent_reference' } } } as any,
  );
  return response.output_text ?? '';
}

/**
 * Run the UBO agent, executing its `query_openapi_registry` function calls in our
 * own code (registryClient handles token exchange/refresh automatically), then
 * feeding the tool output back for the agent's final answer.
 * `span` receives attributes describing whether the registry was actually reached.
 */
async function runUboAgent(
  input: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  span: { setAttribute: (k: string, v: any) => void },
): Promise<string> {
  const openai = getOpenAIClient();
  const ref = { agent_reference: { name: AGENT_NAMES.ubo, type: 'agent_reference' } };

  const first = await openai.responses.create(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { input: [{ type: 'message', role: 'user', content: input }] } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { body: ref } as any,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolOutputs: Array<{ type: 'function_call_output'; call_id: string; output: string }> = [];
  let registryReached = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const item of ((first as any).output ?? []) as any[]) {
    if (item.type === 'function_call' && item.name === REGISTRY_TOOL_NAME) {
      const args = JSON.parse(item.arguments ?? '{}');
      span.setAttribute('kyc.registry_query', `${args.countryCode}/${args.registrationNumber}`);
      let output: string;
      try {
        const data = await queryRegistry({
          countryCode: args.countryCode,
          registrationNumber: args.registrationNumber,
        });
        registryReached = true;
        output = JSON.stringify(data);
      } catch (err) {
        // Return the failure to the agent as tool data so it can degrade, rather
        // than aborting the whole run.
        output = JSON.stringify({
          error: 'registry_unavailable',
          message: err instanceof Error ? err.message.slice(0, 200) : String(err),
        });
        span.setAttribute(
          'kyc.registry_error',
          err instanceof Error ? err.message.slice(0, 200) : String(err),
        );
      }
      toolOutputs.push({ type: 'function_call_output', call_id: item.call_id, output });
    }
  }

  span.setAttribute('kyc.registry_reached', registryReached);

  if (toolOutputs.length === 0) {
    // Agent answered without invoking the tool.
    return first.output_text ?? '';
  }

  const final = await openai.responses.create(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { input: toolOutputs, previous_response_id: first.id } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { body: ref } as any,
  );
  return final.output_text ?? '';
}

/**
 * Execute the three-agent KYB verification pipeline on the Foundry platform:
 *   A. Extraction  →  B. UBO registry (function tool + auto token mgmt)  →  C. Comparison
 * Each step is a self-contained agent run; our spans wrap them into one trace.
 */
export async function runVerification(caseId: string): Promise<VerificationResult> {
  const repo = getRepository();

  return withSpan(
    'kyc.verify',
    { 'kyc.case_id': caseId, 'kyc.pipeline': 'foundry' },
    async (): Promise<VerificationResult> => {
      const existing = await repo.getCaseById(caseId);
      const traceId = currentTraceId();
      const primaryDoc = existing.documents[0];

      // ── Step A: Extraction (vision when a document image is present) ──────
      // Resolve the image from blob storage (production) or inline base64 (local).
      const imageDataUrl = await resolveImageDataUrl(primaryDoc);
      const hasImage = Boolean(imageDataUrl);
      const extracted = await withSpan(
        'kyc.extraction',
        {
          'kyc.agent': AGENT_NAMES.extraction,
          'kyc.case_id': caseId,
          'kyc.vision': hasImage,
        },
        async () => {
          // With an image, instruct the agent to read fields from the document
          // itself. Without one (e.g. API testing), fall back to provided context.
          const input = hasImage
            ? JSON.stringify({
                instruction:
                  'Extract the company legal name, registration/VAT number, document ' +
                  'type, and any shareholders strictly from the attached document image. ' +
                  'Do not guess; if the image is not a corporate document, return ' +
                  '"UNKNOWN" for text fields and an empty shareholders array.',
                expectedDocType: primaryDoc?.docType ?? 'BUSINESS_REGISTRATION',
              })
            : JSON.stringify({
                companyName: existing.companyName,
                countryCode: existing.countryCode,
                docType: primaryDoc?.docType ?? 'BUSINESS_REGISTRATION',
                knownRegistrationNumber: existing.registrationNumber ?? 'UNKNOWN',
              });
          const out = await runAgent(AGENT_NAMES.extraction, input, imageDataUrl);
          return parseJsonObject<ExtractedData>(out);
        },
      );
      let current = await repo.updateAgentState(
        existing.id,
        'extractedData',
        extracted,
        'EXTRACTION_COMPLETE',
      );

      // Authoritative key for the registry lookup: prefer the analyst-supplied
      // number, fall back to whatever extraction produced.
      const lookupNumber =
        existing.registrationNumber?.trim() || extracted.registrationNumber;

      // ── Step B: UBO registry lookup (function tool, auto-managed token) ────
      const registry = await withSpan(
        'kyc.ubo_registry',
        {
          'kyc.agent': AGENT_NAMES.ubo,
          'kyc.case_id': caseId,
          'kyc.registry_configured': await isRegistryConfigured(),
        },
        async (span) => {
          try {
            const out = await runUboAgent(
              JSON.stringify({
                countryCode: existing.countryCode,
                registrationNumber: lookupNumber,
              }),
              span,
            );
            return parseJsonObject<UboRegistryData>(out);
          } catch (err) {
            span.setAttribute(
              'kyc.ubo_error',
              err instanceof Error ? err.message.slice(0, 200) : String(err),
            );
            console.warn('[orchestrator] UBO step failed — degrading:', err);
            return {
              registryName: 'UNAVAILABLE',
              taxCode: lookupNumber,
              shareholders: [],
            } satisfies UboRegistryData;
          }
        },
      );
      current = await repo.updateAgentState(current.id, 'uboRegistryData', registry, 'UBO_COMPLETE');

      // ── Step C: Comparison ────────────────────────────────────────────────
      const comparison = await withSpan(
        'kyc.comparison',
        { 'kyc.agent': AGENT_NAMES.comparison, 'kyc.case_id': caseId },
        async () => {
          const out = await runAgent(
            AGENT_NAMES.comparison,
            JSON.stringify({ extracted, registry }),
          );
          return parseJsonObject<ComparisonResults>(out);
        },
      );
      const finalStatus =
        comparison.discrepancies && comparison.discrepancies.length > 0
          ? 'DISCREPANCY_FOUND'
          : 'VERIFIED';
      current = await repo.updateAgentState(
        current.id,
        'comparisonResults',
        comparison,
        finalStatus,
      );

      return { case: current, traceId };
    },
  );
}
