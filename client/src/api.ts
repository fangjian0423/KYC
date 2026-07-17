import axios from 'axios';
import type { Case, DocType } from './types';

const BASE_URL = (import.meta.env.VITE_BACKEND_API_URL as string) || 'http://localhost:5000';

const api = axios.create({ baseURL: BASE_URL });

export async function fetchCases(): Promise<Case[]> {
  const { data } = await api.get<Case[]>('/api/cases');
  return data;
}

export async function createCase(
  companyName: string,
  countryCode: string,
  docType: DocType,
  file: File,
  registrationNumber?: string,
): Promise<Case> {
  const form = new FormData();
  form.append('companyName', companyName);
  form.append('countryCode', countryCode);
  form.append('docType', docType);
  if (registrationNumber) form.append('registrationNumber', registrationNumber);
  form.append('file', file);
  const { data } = await api.post<Case>('/api/cases', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function verifyCase(id: string): Promise<Case> {
  const { data } = await api.post<Case>(`/api/cases/${id}/verify`);
  return data;
}

/** Public URL of the uploaded document image for a case (served by the backend). */
export function documentUrl(id: string): string {
  return `${BASE_URL}/api/cases/${id}/document`;
}
