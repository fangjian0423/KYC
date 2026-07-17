import { useState, useRef } from 'react';
import type { Case, DocType } from '../types';
import { createCase } from '../api';
import { Building2, Check, Database, FileImage, LockKeyhole, UploadCloud } from 'lucide-react';

const DOC_TYPES: DocType[] = ['PASSPORT', 'BUSINESS_REGISTRATION', 'BANK_STATEMENT'];

interface Props {
  onCaseCreated: (c: Case) => void;
}

export function DocumentUploadComponent({ onCaseCreated }: Props) {
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

  return (
    <div className="onboarding-card">
      <div className="onboarding-progress">
        <div className="active"><span><Building2 size={15} /></span><strong>Entity</strong><small>Business details</small></div>
        <i />
        <div><span><Database size={15} /></span><strong>Registry</strong><small>Source lookup</small></div>
        <i />
        <div><span><FileImage size={15} /></span><strong>Evidence</strong><small>Upload document</small></div>
      </div>

      <form onSubmit={handleSubmit} className="guided-form">
        <div className="form-section-title"><span>1</span><div><h3>Entity information</h3><p>Tell us which business you want to verify.</p></div></div>
        <div className="guided-grid">
        {/* Company Name */}
        <label className="guided-field wide">
          <span>Legal company name</span>
          <input
            type="text"
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. adidas AG"
          />
        </label>

        {/* Country Code */}
        <label className="guided-field">
          <span>Jurisdiction</span>
          <input
            type="text"
            required
            maxLength={2}
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
            placeholder="DE"
          />
        </label>

        {/* VAT / Registration Number */}
        <label className="guided-field">
          <span>Registration / VAT number</span>
          <input
            type="text"
            value={registrationNumber}
            onChange={(e) => setRegistrationNumber(e.target.value)}
            placeholder="e.g. DE132490588"
          />
        </label>
        </div>

        <div className="registry-context">
          <div className="registry-context-icon"><Database size={18} /></div>
          <div><strong>Custom OpenAPI Registry</strong><span>The UBO agent will query the connected DE sandbox using this registration number.</span></div>
          <span className="registry-ready"><Check size={12} /> Ready</span>
        </div>

        <div className="form-section-title second"><span>2</span><div><h3>Supporting evidence</h3><p>Add the source document the agents should inspect.</p></div></div>
        <div className="guided-grid">

        {/* Document Type Selector */}
        <label className="guided-field wide">
          <span>Document type</span>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocType)}
          >
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>

        {/* File Dropzone */}
        <div className="guided-field wide">
          <span>Document image</span>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className={preview ? 'premium-dropzone has-preview' : 'premium-dropzone'}
          >
            {preview ? (
              <img
                src={preview}
                alt="Preview"
                className="document-preview"
              />
            ) : (
              <>
                <div className="upload-icon"><UploadCloud size={25} /></div>
                <p>Drop your evidence here, or <strong>browse files</strong></p>
                <small>PNG or JPEG · up to 25 MB · encrypted at rest</small>
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
          {file && <div className="selected-file"><FileImage size={15} /><span>{file.name}</span><Check size={14} /></div>}
        </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        {/* Actions */}
        <div className="form-submit-row">
          <span><LockKeyhole size={14} /> Secured with Azure Managed Identity</span>
          <button
            type="submit"
            disabled={loading}
            className="primary-button submit-verification"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Submitting…
              </span>
            ) : (
              <>Create verification <span>→</span></>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
