import fs from 'fs';
import path from 'path';
import { foundryConfig } from './client';

/**
 * The corporate-registry tool, in two forms:
 *   • an **OpenAPI tool / toolbox tool** — used to package the API spec into the
 *     governed Toolbox (discovery & governance story), and
 *   • a **function tool** — attached to the UBO agent for *execution*, so our own
 *     code runs the HTTP call and manages the openapi.it API-key → token exchange
 *     and refresh transparently (see registryClient.ts).
 *
 * We use a function tool for execution because the Foundry OpenAPI tool auth only
 * supports anonymous / project_connection / managed_identity — none of which can
 * perform the API-key→short-lived-token exchange this registry requires. Routing
 * execution through our code keeps auth fully automatic (no manual token rotation).
 */
export const REGISTRY_TOOL_NAME = 'query_openapi_registry';

let cachedSpec: unknown;

function loadRegistrySpec(): unknown {
  if (!cachedSpec) {
    const specPath = path.resolve(__dirname, 'assets', 'registry_openapi.json');
    cachedSpec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
  }
  return cachedSpec;
}

function buildAuth() {
  const connectionId = process.env.REGISTRY_CONNECTION_ID;
  if (connectionId) {
    return {
      type: 'project_connection' as const,
      security_scheme: { project_connection_id: connectionId },
    };
  }
  return { type: 'anonymous' as const };
}

/** OpenApiFunctionDefinition for the corporate registry — used inline and inside the toolbox. */
export function registryOpenApiFunction() {
  return {
    name: REGISTRY_TOOL_NAME,
    description:
      'Look up an international corporate entity in the global registry by ISO country code and ' +
      'registration/tax/VAT number. Returns business status and UBO shareholder percentages.',
    spec: loadRegistrySpec(),
    auth: buildAuth(),
  };
}

/** The registry tool as an inline agent tool (`tools: [...]`). */
export function registryOpenApiTool() {
  return { type: 'openapi' as const, openapi: registryOpenApiFunction() };
}

/** The registry tool packaged as a toolbox tool (`ToolboxToolUnion`). */
export function registryToolboxTool() {
  return { type: 'openapi' as const, openapi: registryOpenApiFunction() };
}

/**
 * The registry as a **function tool** for the UBO agent. When the agent decides to
 * call it, the Responses API emits a `function_call`, which our orchestrator
 * executes via registryClient.queryRegistry() (with automatic token management).
 */
export function registryFunctionTool() {
  return {
    type: 'function' as const,
    name: REGISTRY_TOOL_NAME,
    description:
      'Look up an international corporate entity in the official registry by ISO ' +
      'country code and registration/tax/VAT number. Returns the registry profile ' +
      '(company name, status, and ownership where available).',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        countryCode: {
          type: 'string',
          description: 'ISO 2-letter uppercase country code, e.g. DE or IT.',
        },
        registrationNumber: {
          type: 'string',
          description: 'The national registration number, tax code, or VAT number.',
        },
      },
      required: ['countryCode', 'registrationNumber'],
      additionalProperties: false,
    },
  };
}

export { foundryConfig };
