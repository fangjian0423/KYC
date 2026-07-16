import { getProjectClient } from './client';
import { registryToolboxTool, REGISTRY_TOOL_NAME } from './tools';

export const REGISTRY_TOOLBOX_NAME = 'kyc-registry-toolbox';

/**
 * Package the corporate-registry OpenAPI tool into a curated, governed Toolbox
 * (Foundry "Toolboxes" capability). This demonstrates tool packaging, versioning
 * and governance — the toolbox carries metadata + policies describing who may use
 * the tool and for what purpose, independent of any single agent.
 *
 * `toolboxes.createVersion` provisions the toolbox if it does not yet exist, so
 * this is idempotent for provisioning.
 */
export async function ensureRegistryToolbox(): Promise<void> {
  const project = getProjectClient();

  const version = await project.toolboxes.createVersion(
    REGISTRY_TOOLBOX_NAME,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [registryToolboxTool()] as any,
    {
      description:
        'Curated KYB tool collection for corporate registry / UBO verification. ' +
        'Governs access to the external company registry OpenAPI endpoint.',
      metadata: {
        domain: 'kyc-kyb',
        owner: 'compliance-platform',
        dataClassification: 'external-registry',
        tool: REGISTRY_TOOL_NAME,
      },
    },
  );

  console.log(
    `[toolbox] ensured '${REGISTRY_TOOLBOX_NAME}' (version ${version.version}, ` +
      `${version.tools?.length ?? 0} tool(s))`,
  );
}

/** List toolboxes in the project (exercises tool discovery/governance). */
export async function listToolboxes(): Promise<void> {
  const project = getProjectClient();
  console.log('[toolbox] project toolboxes:');
  for await (const tb of project.toolboxes.list()) {
    console.log(`  • ${tb.name} (default version ${tb.default_version})`);
  }
}
