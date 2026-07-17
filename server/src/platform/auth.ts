import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

function equalSecret(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.PLATFORM_ADMIN_KEY ?? '';
  if (!expected && process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  const actual = req.header('x-platform-admin-key') ?? '';
  if (!expected || !equalSecret(actual, expected)) {
    res.status(401).json({ error: 'A valid platform operator access code is required.' });
    return;
  }
  next();
}