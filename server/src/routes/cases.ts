import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getRepository } from '../db/repositoryFactory';
import type { CaseDocument, DocType } from '../types';

const router = Router();

// Store uploads in memory — no disk dependency for PoC
const upload = multer({ storage: multer.memoryStorage() });

// ── GET /api/cases ───────────────────────────────────────────────────────────
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cases = await getRepository().getActiveCases();
    res.json(cases);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/cases/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const c = await getRepository().getCaseById(req.params.id);
    res.json(c);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/cases ──────────────────────────────────────────────────────────
router.post('/', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { companyName, countryCode, docType } = req.body as {
      companyName: string;
      countryCode: string;
      docType: DocType;
    };

    if (!companyName || !countryCode || !docType) {
      res.status(400).json({ error: 'companyName, countryCode and docType are required.' });
      return;
    }

    const file = req.file;
    const doc: CaseDocument = {
      docId: uuidv4(),
      fileName: file?.originalname ?? 'unknown',
      docType,
      // In a real deployment this would be an Azure Blob Storage URL
      blobUrl: file ? `local://${file.originalname}` : 'local://no-file',
    };

    const newCase = await getRepository().createCase(companyName, countryCode, [doc]);
    res.status(201).json(newCase);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/cases/:id/verify ───────────────────────────────────────────────
router.post('/:id/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = getRepository();
    const existing = await repo.getCaseById(req.params.id);

    if (process.env.FOUNDRY_PROJECT_ENDPOINT) {
      // Real Foundry pipeline — to be wired per foundry-router.md
      res.status(501).json({ error: 'Foundry pipeline not yet wired — set FOUNDRY_PROJECT_ENDPOINT.' });
      return;
    }

    // ── Mock agent pipeline ──────────────────────────────────────────────────
    // Step A: Extraction agent
    let c = await repo.updateAgentState(
      existing.id,
      'extractedData',
      {
        registrationNumber: 'DE132490588',
        legalName: existing.companyName,
        documentTypeIdentified: existing.documents[0]?.docType ?? 'BUSINESS_REGISTRATION',
        shareholders: [
          { name: 'Alice Müller', equityPercentage: 60 },
          { name: 'Bob Schmidt', equityPercentage: 40 },
        ],
      },
      'EXTRACTION_COMPLETE',
    );

    // Step B: UBO Registry agent
    c = await repo.updateAgentState(
      c.id,
      'uboRegistryData',
      {
        registryName: 'Handelsregister Deutschland',
        taxCode: 'DE132490588',
        shareholders: [
          { name: 'Alice Müller', equityPercentage: 60 },
          { name: 'Bob Schmidt', equityPercentage: 35 },
        ],
      },
      'UBO_COMPLETE',
    );

    // Step C: Comparison agent
    const discrepancies = [
      {
        field: 'shareholders[1].equityPercentage',
        extractedValue: '40',
        registryValue: '35',
        severity: 'WARNING' as const,
      },
    ];
    c = await repo.updateAgentState(
      c.id,
      'comparisonResults',
      { matchScore: 82, discrepancies },
      discrepancies.length === 0 ? 'VERIFIED' : 'DISCREPANCY_FOUND',
    );

    res.json(c);
  } catch (err) {
    next(err);
  }
});

export default router;
