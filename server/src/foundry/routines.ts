import { getProjectClient } from './client';
import { AGENT_NAMES } from './agents';

export const KYC_ROUTINE_NAME = 'kyc-perpetual-review';

/**
 * Define a scheduled "perpetual KYC" routine (Foundry "Routines" capability).
 *
 * Ongoing/perpetual KYC requires periodically re-verifying onboarded entities
 * against the registry to catch ownership changes. This routine fires on a cron
 * schedule and invokes the UBO registry agent to re-check ownership — acting as a
 * compliance watchdog without any always-on server.
 *
 * Cron defaults to 08:00 every Monday; override with KYC_ROUTINE_CRON.
 */
export async function ensurePeriodicKycRoutine(): Promise<void> {
  const project = getProjectClient();

  const cron = process.env.KYC_ROUTINE_CRON ?? '0 8 * * 1';
  const timeZone = process.env.KYC_ROUTINE_TZ ?? 'UTC';

  const routine = await project.beta.routines.createOrUpdate(KYC_ROUTINE_NAME, {
    foundryFeatures: 'Routines=V1Preview',
    description:
      'Perpetual KYC watchdog: periodically re-verifies onboarded entities against the ' +
      'corporate registry to detect ownership changes.',
    enabled: true,
    triggers: {
      weeklyReview: {
        type: 'schedule',
        cron_expression: cron,
        time_zone: timeZone,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    },
    action: {
      type: 'invoke_agent_responses_api',
      agent_name: AGENT_NAMES.ubo,
      input:
        'Scheduled perpetual-KYC review. Re-verify the ownership structure for all active ' +
        'cases against the corporate registry and flag any changes since the last review.',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  });

  console.log(
    `[routines] ensured '${KYC_ROUTINE_NAME}' (enabled=${routine.enabled}, cron='${cron}' ${timeZone})`,
  );
}

/** List routines in the project (exercises the routines catalog). */
export async function listRoutines(): Promise<void> {
  const project = getProjectClient();
  console.log('[routines] project routines:');
  for await (const r of project.beta.routines.list({ foundryFeatures: 'Routines=V1Preview' })) {
    console.log(`  • ${r.name} (enabled=${r.enabled})`);
  }
}
