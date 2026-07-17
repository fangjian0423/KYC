import { Router } from 'express';
import { requirePlatformAdmin } from '../platform/auth';
import {
  getRegistryConfiguration,
  saveRegistryConfiguration,
  validateRegistryConfiguration,
} from '../platform/registryConfiguration';
import { queryRegistry } from '../foundry/registryClient';
import { savePlatformDocument } from '../platform/store';
import {
  createDeploymentJob,
  getDeploymentJob,
  getDeploymentProfile,
  listDeploymentJobs,
} from '../platform/deploymentService';

const router = Router();

router.get('/registry', async (_req, res, next) => {
  try { res.json(await getRegistryConfiguration()); }
  catch (error) { next(error); }
});

router.put('/registry', requirePlatformAdmin, async (req, res, next) => {
  try {
    const configuration = await validateRegistryConfiguration(req.body);
    res.json(await saveRegistryConfiguration(configuration));
  } catch (error) { next(error); }
});

router.post('/registry/test', requirePlatformAdmin, async (req, res, next) => {
  try {
    const configuration = await validateRegistryConfiguration(req.body.configuration);
    const countryCode = String(req.body.countryCode ?? 'DE').toUpperCase();
    const registrationNumber = String(req.body.registrationNumber ?? 'DE132490588');
    if (!/^[A-Z]{2}$/.test(countryCode) || !/^[A-Za-z0-9.-]{3,40}$/.test(registrationNumber)) {
      res.status(400).json({ error: 'A valid country code and registration number are required.' });
      return;
    }
    const started = Date.now();
    await queryRegistry({ countryCode, registrationNumber }, configuration);
    const result = {
      ok: true,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      message: `Live registry lookup succeeded for ${countryCode}/${registrationNumber}.`,
    };
    await savePlatformDocument({ ...configuration, lastTest: result, updatedAt: result.checkedAt });
    res.json(result);
  } catch (error) { next(error); }
});

router.get('/deployment-profile', async (_req, res, next) => {
  try { res.json(await getDeploymentProfile()); }
  catch (error) { next(error); }
});

router.get('/deployments', requirePlatformAdmin, async (_req, res, next) => {
  try { res.json(await listDeploymentJobs()); }
  catch (error) { next(error); }
});

router.get('/deployments/:id', requirePlatformAdmin, async (req, res, next) => {
  try { res.json(await getDeploymentJob(req.params.id)); }
  catch (error) { next(error); }
});

router.post('/deployments', requirePlatformAdmin, async (req, res, next) => {
  try { res.status(202).json(await createDeploymentJob(req.body.environmentName)); }
  catch (error) { next(error); }
});

export default router;