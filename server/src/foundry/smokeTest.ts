import { AIProjectClient } from '@azure/ai-projects';
import { DefaultAzureCredential } from '@azure/identity';
import dotenv from 'dotenv';

dotenv.config();

const endpoint =
  process.env.FOUNDRY_PROJECT_ENDPOINT ??
  'https://jimmy-test.services.ai.azure.com/api/projects/proj-default';
const model = process.env.FOUNDRY_MODEL_NAME ?? 'gpt-5.4';

async function main(): Promise<void> {
  console.log(`Connecting to Foundry project: ${endpoint}`);
  const project = new AIProjectClient(endpoint, new DefaultAzureCredential());

  console.log('\n── Deployments ──────────────────────────────');
  for await (const deployment of project.deployments.list()) {
    console.log(`  • ${deployment.name} (${deployment.type})`);
  }

  console.log(`\n── Responses smoke test (model: ${model}) ───`);
  const openai = project.getOpenAIClient();
  const response = await openai.responses.create({
    model,
    input: 'Reply with the single word: OK',
  });
  console.log('  Response:', response.output_text);
  console.log('\n✅ Foundry connectivity verified.');
}

main().catch((err) => {
  console.error('\n❌ Smoke test failed:');
  console.error(err);
  process.exit(1);
});
