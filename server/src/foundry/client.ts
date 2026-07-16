import { AIProjectClient } from '@azure/ai-projects';
import { DefaultAzureCredential } from '@azure/identity';

export const foundryConfig = {
  endpoint:
    process.env.FOUNDRY_PROJECT_ENDPOINT ??
    'https://jimmy-test.services.ai.azure.com/api/projects/proj-default',
  model: process.env.FOUNDRY_MODEL_NAME ?? 'gpt-5.4',
  /** Static API key for the sandbox corporate registry (Authorization header). */
  registryApiKey: process.env.REGISTRY_API_KEY ?? '',
};

/** True when a real Foundry endpoint is configured and the pipeline should run against the platform. */
export function isFoundryEnabled(): boolean {
  return Boolean(process.env.FOUNDRY_PROJECT_ENDPOINT);
}

let projectClient: AIProjectClient | undefined;

/** Lazily-constructed singleton AIProjectClient authenticated via DefaultAzureCredential (az login). */
export function getProjectClient(): AIProjectClient {
  if (!projectClient) {
    projectClient = new AIProjectClient(foundryConfig.endpoint, new DefaultAzureCredential());
  }
  return projectClient;
}

/** OpenAI-compatible client bound to the Foundry project, used to run agents via Responses/Conversations. */
export function getOpenAIClient(): ReturnType<AIProjectClient['getOpenAIClient']> {
  return getProjectClient().getOpenAIClient();
}
