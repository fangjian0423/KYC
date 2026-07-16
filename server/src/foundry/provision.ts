import dotenv from 'dotenv';
import { initTracing } from './tracing';
import { ensureAgents } from './agents';
import { ensureRegistryToolbox, listToolboxes } from './toolbox';
import { ensurePeriodicKycRoutine, listRoutines } from './routines';
import { isFoundryEnabled, foundryConfig } from './client';

dotenv.config();

/**
 * Idempotently provision all Foundry platform resources for the KYC agent:
 *   • three prompt agents (extraction / UBO / comparison)
 *   • the governed registry Toolbox
 *   • the scheduled perpetual-KYC routine
 *
 * Run with:  npm run provision
 */
async function main(): Promise<void> {
  if (!isFoundryEnabled()) {
    console.error('FOUNDRY_PROJECT_ENDPOINT is not set — nothing to provision.');
    process.exit(1);
  }

  initTracing();
  console.log(`Provisioning Foundry resources on ${foundryConfig.endpoint}\n`);

  console.log('── Toolbox ──────────────────────────────────');
  await ensureRegistryToolbox();

  console.log('\n── Agents ───────────────────────────────────');
  await ensureAgents();

  console.log('\n── Routine ──────────────────────────────────');
  await ensurePeriodicKycRoutine();

  console.log('\n── Discovery ────────────────────────────────');
  await listToolboxes();
  await listRoutines();

  console.log('\n✅ Provisioning complete.');
}

main().catch((err) => {
  console.error('\n❌ Provisioning failed:');
  console.error(err);
  process.exit(1);
});
