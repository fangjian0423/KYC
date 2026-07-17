import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getRepository } from '../db/repositoryFactory';
import { isFoundryEnabled } from '../foundry/client';
import { runVerification } from '../foundry/orchestrator';
import { isBlobConfigured, uploadDocumentImage, resolveImageDataUrl } from '../storage/blobClient';
import type { CaseDocument, DocType } from '../types';

const router = Router();

// Store uploads in memory — no disk dependency for PoC
const upload = multer({ storage: multer.memoryStorage() });

/** Remove heavy base64 image data from documents before sending a case to the client. */
function stripImages<T extends { documents?: CaseDocument[] }>(c: T): T {
  if (!c.documents) return c;
  return {
    ...c,
    documents: c.documents.map(({ imageDataUrl: _omit, ...rest }) => rest),
  };
}

// ── GET /api/cases ───────────────────────────────────────────────────────────
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cases = await getRepository().getActiveCases();
    res.json(cases.map(stripImages));
  } catch (err) {
    next(err);
  }
});

// ── GET /api/cases/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const c = await getRepository().getCaseById(req.params.id);
    res.json(stripImages(c));
  } catch (err) {
    next(err);
  }
});

// ── GET /api/cases/:id/document ───────────────────────────────────────────────
// Streams the uploaded document image for the case (first document). Prefers an
// inline base64 image (mock/local) and falls back to Blob Storage (production).
router.get('/:id/document', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const c = await getRepository().getCaseById(req.params.id);
    const doc = c.documents[0];
    const dataUrl = await resolveImageDataUrl(doc);
    const match = dataUrl?.match(/^data:(.+?);base64,(.*)$/);
    if (!match) {
      res.status(404).json({ error: 'No document image for this case.' });
      return;
    }
    const [, mime, b64] = match;
    res.setHeader('Content-Type', mime);
    res.send(Buffer.from(b64, 'base64'));
  } catch (err) {
    next(err);
  }
});

// ── POST /api/cases ──────────────────────────────────────────────────────────
router.post('/', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { companyName, countryCode, docType, registrationNumber } = req.body as {
      companyName: string;
      countryCode: string;
      docType: DocType;
      registrationNumber?: string;
    };

    if (!companyName || !countryCode || !docType) {
      res.status(400).json({ error: 'companyName, countryCode and docType are required.' });
      return;
    }

    const file = req.file;
    const looksLikeImage =
      !!file &&
      (file.mimetype?.startsWith('image/') ||
        /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.originalname ?? ''));
    const mime =
      file?.mimetype && file.mimetype.startsWith('image/')
        ? file.mimetype
        : `image/${(path.extname(file?.originalname ?? '').slice(1) || 'png').toLowerCase()}`;
    const inlineDataUrl =
      file && looksLikeImage
        ? `data:${mime};base64,${file.buffer.toString('base64')}`
        : undefined;

    const docId = uuidv4();

    // Persist the image to Blob Storage when configured; otherwise keep it inline
    // (base64 in the DB) for local/mock runs. Blob avoids storing heavy base64 in
    // the database and keeps documents in durable storage for production.
    let blobUrl = file ? `local://${file.originalname}` : 'local://no-file';
    let imageDataUrl = inlineDataUrl;
    if (file && looksLikeImage && isBlobConfigured()) {
      blobUrl = await uploadDocumentImage(docId, file.buffer, mime);
      // Don't duplicate the base64 in the DB — the vision step reloads it from blob.
      imageDataUrl = undefined;
    }

    const doc: CaseDocument = {
      docId,
      fileName: file?.originalname ?? 'unknown',
      docType,
      blobUrl,
      imageDataUrl,
    };

    const newCase = await getRepository().createCase(
      companyName,
      countryCode,
      [doc],
      registrationNumber?.trim() || undefined,
    );
    res.status(201).json(stripImages(newCase));
  } catch (err) {
    next(err);
  }
});

// ── POST /api/cases/:id/verify ───────────────────────────────────────────────
router.post('/:id/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = getRepository();
    const existing = await repo.getCaseById(req.params.id);

    if (isFoundryEnabled()) {
      // ── Real Foundry multi-agent pipeline ────────────────────────────────
      const { case: verified, traceId } = await runVerification(existing.id);
      res.json({ ...stripImages(verified), traceId });
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
        description:
          'The second shareholder\'s equity percentage differs between the document (40%) ' +
          'and the registry (35%). A 5-point ownership gap warrants review but is not itself ' +
          'a strong fraud signal.',
      },
    ];
    c = await repo.updateAgentState(
      c.id,
      'comparisonResults',
      {
        matchScore: 82,
        summary:
          'Entity identity matches the registry, but the reported ownership split differs ' +
          'slightly from the official record (see discrepancy below).',
        discrepancies,
      },
      discrepancies.length === 0 ? 'VERIFIED' : 'DISCREPANCY_FOUND',
    );

    res.json(c);
  } catch (err) {
    next(err);
  }
});

export default router;
