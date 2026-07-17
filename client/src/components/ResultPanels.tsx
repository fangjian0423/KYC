import type { ExtractedData, UboRegistryData, ComparisonResults, Discrepancy } from '../types';
import type { CSSProperties } from 'react';
import { AlertTriangle, Check, Database, FileSearch, Scale, ShieldAlert, Sparkles, Users } from 'lucide-react';

function DataField({ label, value }: { label: string; value: string }) {
  return <div className="data-field"><span>{label}</span><strong>{value || 'Not found'}</strong></div>;
}

function OwnershipList({ shareholders }: { shareholders: Array<{ name: string; equityPercentage: number }> }) {
  return <div className="ownership-list"><div className="ownership-title"><Users size={14} /> Ownership structure</div>{shareholders.length ? shareholders.map((s) => <div className="owner-row" key={s.name}><div className="owner-avatar">{s.name.slice(0,2).toUpperCase()}</div><span>{s.name}</span><strong>{s.equityPercentage}%</strong></div>) : <p>No shareholders reported by this source.</p>}</div>;
}

// ─── Extracted Data Card ────────────────────────────────────────────────────

export function ExtractedDataCard({ data }: { data?: ExtractedData }) {
  return (
    <div className="evidence-card">
      <div className="evidence-heading"><div className="evidence-icon document"><FileSearch size={18} /></div><div><span>AGENT 01 · DOCUMENT AI</span><h3>Extracted evidence</h3></div>{data && <em><Check size={12} /> Complete</em>}</div>
      {data ? (
        <><div className="data-grid"><DataField label="Legal name" value={data.legalName} /><DataField label="Registration number" value={data.registrationNumber} /><DataField label="Document classified as" value={data.documentTypeIdentified.replace(/_/g, ' ')} /></div><OwnershipList shareholders={data.shareholders} /></>
      ) : (
        <div className="awaiting-agent"><FileSearch size={24} /><span>Waiting for document analysis</span><small>The vision agent will extract entity fields here.</small></div>
      )}
    </div>
  );
}

// ─── Registry Data Card ─────────────────────────────────────────────────────

export function RegistryDataCard({ data }: { data?: UboRegistryData }) {
  return (
    <div className="evidence-card">
      <div className="evidence-heading"><div className="evidence-icon registry"><Database size={18} /></div><div><span>AGENT 02 · UBO REGISTRY</span><h3>Official registry profile</h3></div>{data && <em><span className="source-dot" /> Live source</em>}</div>
      {data ? (
        <><div className="data-grid"><DataField label="Registry entity" value={data.registryName} /><DataField label="Official tax / VAT code" value={data.taxCode} /><DataField label="Source" value="Custom OpenAPI · DE" /></div><OwnershipList shareholders={data.shareholders} /></>
      ) : (
        <div className="awaiting-agent"><Database size={24} /><span>Registry lookup pending</span><small>Your configured UBO source will appear here.</small></div>
      )}
    </div>
  );
}

// ─── Match Score Gauge ──────────────────────────────────────────────────────

function DiscrepancyRow({ d }: { d: Discrepancy }) {
  return (
    <div className={`discrepancy-card ${d.severity === 'CRITICAL' ? 'critical' : 'warning'}`}>
      <div className="flex items-center justify-between gap-2">
        <p><ShieldAlert size={14} /> {d.field}</p>
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
            d.severity === 'CRITICAL'
              ? 'bg-red-200 text-red-800'
              : 'bg-yellow-200 text-yellow-800'
          }`}
        >
          {d.severity}
        </span>
      </div>
      {d.description && <p className="discrepancy-description">{d.description}</p>}
      <div className="value-comparison"><div><span>DOCUMENT</span><strong>{d.extractedValue}</strong></div><Scale size={15} /><div><span>REGISTRY</span><strong>{d.registryValue}</strong></div></div>
    </div>
  );
}

export function IntelligencePanel({ data }: { data?: ComparisonResults }) {
  return (
    <div className="intelligence-card">
      <div className="evidence-heading"><div className="evidence-icon intelligence"><Sparkles size={18} /></div><div><span>AGENT 03 · RISK INTELLIGENCE</span><h3>Decision intelligence</h3></div></div>

      {data ? (
        <>
          {/* Score gauge */}
          <div className="score-zone">
            <div className={`score-ring ${data.matchScore >= 80 ? 'good' : data.matchScore >= 50 ? 'medium' : 'bad'}`} style={{ '--score': `${data.matchScore * 3.6}deg` } as CSSProperties}><div><strong>{data.matchScore}</strong><span>/100</span></div></div>
            <div><span>ENTITY MATCH</span><h4>{data.matchScore >= 80 ? 'High confidence match' : data.matchScore >= 50 ? 'Manual review suggested' : 'Critical mismatch detected'}</h4><p>{data.discrepancies.length} evidence difference{data.discrepancies.length === 1 ? '' : 's'} identified</p></div>
          </div>

          {/* Plain-language summary */}
          {data.summary && (
            <div className="assessment-box">
              <p><Sparkles size={13} /> AI ASSESSMENT</p>
              <div>{data.summary}</div>
            </div>
          )}

          {/* Discrepancies */}
          {data.discrepancies.length > 0 ? (
            <div className="discrepancy-list">
              <p><AlertTriangle size={14} /> Evidence discrepancies <span>{data.discrepancies.length}</span></p>
              {data.discrepancies.map((d, i) => (
                <DiscrepancyRow key={i} d={d} />
              ))}
            </div>
          ) : (
            <div className="all-clear"><Check size={18} /> All source evidence is consistent.</div>
          )}
        </>
      ) : (
        <div className="awaiting-agent large"><Sparkles size={27} /><span>Ready to generate a decision</span><small>Run verification to compare evidence and explain risk.</small></div>
      )}
    </div>
  );
}
