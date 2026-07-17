import { foundryConfig } from './client';

/**
 * The corporate-registry tool, exposed to the UBO agent as a **function tool**.
 *
 * When the agent decides to look up a company, the Responses API emits a
 * `function_call`, which our orchestrator executes via
 * registryClient.queryRegistry() — our code runs the HTTP call and manages the
 * openapi.it API-key → short-lived-token exchange and refresh transparently.
 *
 * We use a function tool (not the Foundry OpenAPI tool) because the OpenAPI tool's
 * auth only supports anonymous / project_connection / managed_identity — none of
 * which can perform the API-key→token exchange this registry requires. Routing
 * execution through our code keeps auth fully automatic (no manual token rotation).
 */
export const REGISTRY_TOOL_NAME = 'query_openapi_registry';

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
