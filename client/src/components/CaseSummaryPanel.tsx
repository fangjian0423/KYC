import { useState } from 'react';
import type { Case } from '../types';
import { verifyCase, documentUrl } from '../api';
import { Building2, FileImage, LoaderCircle, Play, RotateCw, ShieldCheck } from 'lucide-react';

interface Props {
  caseData: Case;
  onVerified: (c: Case) => void;
}

const STEPS = ['Extracting document', 'Verifying registry', 'Comparing & scoring'];

export function CaseSummaryPanel({ caseData, onVerified }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const alreadyVerified = Boolean(caseData.comparisonResults);

  async function handleVerify() {
    setError(null);
    setLoading(true);
    try {
      const updated = await verifyCase(caseData.id);
      onVerified(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  }

  const doc = caseData.documents[0];

  return (
    <div className="case-summary-card">
      <div className="summary-heading"><div className="evidence-icon company"><Building2 size={18} /></div><div><span>CASE EVIDENCE</span><h3>Submitted profile</h3></div></div>

      {/* Submitted data */}
      <dl className="summary-fields">
        <dt>Company</dt><dd>{caseData.companyName}</dd>

        <dt>Jurisdiction</dt><dd><span className="country-chip">{caseData.countryCode}</span></dd>

        <dt>VAT / Reg. No.</dt><dd>{caseData.registrationNumber || '—'}</dd>

        <dt>Document</dt><dd>{doc?.docType?.replace(/_/g, ' ')}</dd>

        {doc?.fileName && doc.fileName !== 'unknown' && (
          <>
            <dt>File</dt><dd>{doc.fileName}</dd>
          </>
        )}
      </dl>

      {/* Uploaded document preview */}
      {!imgFailed && (
        <div className="document-evidence">
          <p><FileImage size={14} /> Uploaded evidence <span>Secured in Azure Blob</span></p>
          <img
            src={documentUrl(caseData.id)}
            alt="Uploaded document"
            onError={() => setImgFailed(true)}
            className="evidence-image"
          />
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      {/* Verify action */}
      <button
        type="button"
        onClick={handleVerify}
        disabled={loading}
        className="verify-button"
      >
        {loading ? <><LoaderCircle className="spin" size={16} /> Running verification…</> : alreadyVerified ? <><RotateCw size={16} /> Re-run verification</> : <><Play size={16} /> Run AI verification</>}
      </button>

      {/* Loading pipeline indicator */}
      {loading && (
        <div className="running-pipeline">
          <p><ShieldCheck size={16} /> Microsoft Foundry is orchestrating 3 agents</p>
          <ul>
            {STEPS.map((s) => (
              <li key={s}><span /><div>{s}<small>In progress</small></div></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
