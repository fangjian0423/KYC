import { useState, useRef } from 'react';
import type { Case, DocType } from '../types';
import { createCase, verifyCase } from '../api';

const DOC_TYPES: DocType[] = ['PASSPORT', 'BUSINESS_REGISTRATION', 'BANK_STATEMENT'];

interface Props {
  caseId?: string; // if set, we skip creation and go straight to verify
  onCaseCreated: (c: Case) => void;
  onVerified: (c: Case) => void;
}

export function DocumentUploadComponent({ caseId, onCaseCreated, onVerified }: Props) {
  const [companyName, setCompanyName] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [docType, setDocType] = useState<DocType>('PASSPORT');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    if (picked) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(picked);
    } else {
      setPreview(null);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0] ?? null;
    if (dropped && dropped.type.startsWith('image/')) {
      setFile(dropped);
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(dropped);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError('Please select a document image.');
      return;
    }

    setLoading(true);
    try {
      const created = await createCase(companyName, countryCode, docType, file, registrationNumber);
      onCaseCreated(created);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create case.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (!caseId) return;
    setError(null);
    setLoading(true);
    try {
      const updated = await verifyCase(caseId);
      onVerified(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Upload Document
      </h3>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Company Name */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Company Name</label>
          <input
            type="text"
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Acme Corp Ltd."
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Country Code */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Country (ISO-2)</label>
          <input
            type="text"
            required
            maxLength={2}
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
            placeholder="GB"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* VAT / Registration Number */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            VAT / Registration Number
          </label>
          <input
            type="text"
            value={registrationNumber}
            onChange={(e) => setRegistrationNumber(e.target.value)}
            placeholder="e.g. DE132490588"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            Used to query the corporate registry. Sandbox example: DE132490588 (adidas AG).
          </p>
        </div>

        {/* Document Type Selector */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Document Type</label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocType)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* File Dropzone */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Document Image</label>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50"
          >
            {preview ? (
              <img
                src={preview}
                alt="Preview"
                className="max-h-40 rounded object-contain"
              />
            ) : (
              <>
                <svg
                  className="mb-2 h-8 w-8 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 16.5V19a2 2 0 002 2h14a2 2 0 002-2v-2.5M12 3v13m0-13L8 7m4-4l4 4"
                  />
                </svg>
                <p className="text-sm text-gray-500">
                  Drag &amp; drop or <span className="text-indigo-600 font-medium">browse</span>
                </p>
                <p className="mt-1 text-xs text-gray-400">JPEG, PNG accepted</p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          {file && (
            <p className="mt-1 text-xs text-gray-500 truncate">{file.name}</p>
          )}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading && !caseId ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Submitting…
              </span>
            ) : (
              'Submit Case'
            )}
          </button>

          {caseId && (
            <button
              type="button"
              disabled={loading}
              onClick={handleVerify}
              className="flex-1 rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Verifying…
                </span>
              ) : (
                'Trigger Verification'
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
