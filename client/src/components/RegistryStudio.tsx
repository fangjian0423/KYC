import { useCallback, useEffect, useState } from 'react';
import { Check, Database, Globe2, KeyRound, LoaderCircle, Plus, Sparkles } from 'lucide-react';
import type { RegistryConfiguration, RegistryFieldMappings } from '../types';
import {
  apiErrorMessage,
  fetchRegistryConfiguration,
  saveRegistryConfiguration,
  testRegistryConfiguration,
} from '../api';

interface Props {
  onBack: () => void;
}

const mappingRows: Array<{ key: keyof RegistryFieldMappings; label: string; sample: string }> = [
  { key: 'legalName', label: 'Legal name', sample: 'adidas AG' },
  { key: 'registrationNumber', label: 'Registration no.', sample: 'DE132490588' },
  { key: 'shareholders', label: 'Shareholders', sample: '2 records' },
  { key: 'equityPercentage', label: 'Equity %', sample: '60%' },
];

export function RegistryStudio({ onBack }: Props) {
  const [configuration, setConfiguration] = useState<RegistryConfiguration | null>(null);
  const [operatorKey, setOperatorKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'save' | 'test' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setConfiguration(await fetchRegistryConfiguration()); }
    catch (loadError) { setError(apiErrorMessage(loadError, 'Registry configuration could not be loaded.')); }
    finally { setLoading(false); }
  }, []);

  // Initial synchronization with the registry configuration API.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  function updateMapping(key: keyof RegistryFieldMappings, value: string) {
    setConfiguration((current) => current && ({
      ...current,
      fieldMappings: { ...current.fieldMappings, [key]: value },
    }));
  }

  async function save() {
    if (!configuration) return;
    setAction('save');
    setError(null);
    setNotice(null);
    try {
      const saved = await saveRegistryConfiguration(configuration, operatorKey);
      setConfiguration(saved);
      setNotice('Configuration saved. New verification runs will use these settings.');
    } catch (saveError) {
      setError(apiErrorMessage(saveError, 'Configuration could not be saved.'));
    } finally { setAction(null); }
  }

  async function test() {
    if (!configuration) return;
    setAction('test');
    setError(null);
    setNotice(null);
    try {
      const result = await testRegistryConfiguration(configuration, operatorKey);
      setConfiguration((current) => current && ({ ...current, lastTest: result }));
      setNotice(`${result.message} ${result.latencyMs} ms.`);
    } catch (testError) {
      setError(apiErrorMessage(testError, 'The live registry test failed.'));
    } finally { setAction(null); }
  }

  const connected = Boolean(configuration?.enabled && configuration.credentialConfigured);
  const lastTest = configuration?.lastTest;

  return <div className="page-container registry-page">
    <button className="back-link" onClick={onBack}>← Back to command center</button>
    <div className="registry-hero">
      <div><div className="eyebrow"><Database size={14} /> LIVE CONNECTOR CONFIGURATION</div><h1>Registry Studio</h1><p>Configure the UBO source used by the live Foundry workflow. Settings are validated by the backend and persisted in Cosmos DB.</p></div>
      <div className="connection-health"><span className={connected ? '' : 'offline'}><i /> {connected ? 'Configured' : 'Action required'}</span><strong>{configuration?.displayName ?? 'Loading connector'}</strong><small>{lastTest?.ok ? `Live test ${lastTest.latencyMs} ms · ${new Date(lastTest.checkedAt).toLocaleTimeString()}` : connected ? 'Credentials secured in Container Apps' : 'Registry credentials are not configured'}</small></div>
    </div>
    <div className="registry-layout">
      <aside className="registry-sidebar"><span>CONNECTORS</span><button className="selected"><div className="provider-icon">OA</div><div><strong>Custom OpenAPI</strong><small>Active provider</small></div><Check size={16} /></button><button disabled><div className="provider-icon muted-logo">CH</div><div><strong>Companies House</strong><small>Coming soon</small></div></button><button disabled><div className="provider-icon muted-logo">BR</div><div><strong>Bundesregister</strong><small>Coming soon</small></div></button><button className="add-provider" disabled><Plus size={16} /> Add provider</button></aside>
      <section className="registry-config">
        {loading && <div className="loading-state"><LoaderCircle className="spin" /><span>Loading the active connector…</span></div>}
        {!loading && configuration && <>
          <div className="config-header"><div><h2>{configuration.displayName}</h2><p>Live configuration · updated {new Date(configuration.updatedAt).toLocaleString()}</p></div><span className={connected ? 'connected-badge' : 'connected-badge blocked'}><i /> {connected ? 'Credentials ready' : 'Credentials missing'}</span></div>
          <div className="config-section"><div className="config-title"><span>1</span><div><h3>Connection</h3><p>Only allowlisted HTTPS registry hosts can be saved.</p></div></div><div className="form-grid"><label className="field full"><span>Base URL</span><div className="input-with-icon"><Globe2 size={16} /><input value={configuration.baseUrl} onChange={(event) => setConfiguration({ ...configuration, baseUrl: event.target.value })} /></div></label><label className="field"><span>Authentication</span><select value={configuration.authMethod} disabled><option value="oauth2_exchange">OAuth 2.0 token exchange</option></select></label><label className="field"><span>Data residency</span><select value={configuration.region} onChange={(event) => setConfiguration({ ...configuration, region: event.target.value as RegistryConfiguration['region'] })}><option value="EU">European Union</option><option value="UK">United Kingdom</option><option value="US">United States</option></select></label></div></div>
          <div className="config-section"><div className="config-title"><span>2</span><div><h3>Field mapping</h3><p>These mapping hints are sent with live registry data to the UBO agent.</p></div></div><div className="mapping-table"><div className="mapping-head"><span>VerityOS field</span><span>Registry response</span><span>Sample</span></div>{mappingRows.map((row) => <div className="mapping-row editable" key={row.key}><strong>{row.label}</strong><input value={configuration.fieldMappings[row.key]} onChange={(event) => updateMapping(row.key, event.target.value)} /><span>{row.sample}</span></div>)}</div></div>
          <div className="config-section compact-section"><div className="config-title"><span>3</span><div><h3>Agent routing</h3><p>Saved settings are resolved for every registry tool call.</p></div></div><div className="agent-route"><div className="step-icon"><Sparkles size={18} /></div><div><strong>kyc-ubo-registry-agent</strong><span>Microsoft Foundry · live function tool</span></div><span className="connected-badge"><Check size={13} /> Ready</span></div></div>
          <div className="operator-gate"><KeyRound size={16} /><label><span>Operator access code</span><input type="password" value={operatorKey} onChange={(event) => setOperatorKey(event.target.value)} placeholder="Required to test or save" autoComplete="off" /></label><small>Sent only with this protected request and never persisted in the browser.</small></div>
          {notice && <div className="inline-notice success"><Check size={15} /> {notice}</div>}
          {error && <div className="inline-notice error">{error}</div>}
          <div className="config-actions"><button className="secondary-button" onClick={test} disabled={!operatorKey || action !== null}>{action === 'test' ? <><LoaderCircle className="spin" size={16} /> Testing live source…</> : 'Test connection'}</button><button className="primary-button" onClick={save} disabled={!operatorKey || action !== null}>{action === 'save' ? <><LoaderCircle className="spin" size={16} /> Saving…</> : 'Save configuration'}</button></div>
        </>}
        {!loading && error && !configuration && <div className="error-state">{error}<button onClick={load}>Try again</button></div>}
      </section>
    </div>
  </div>;
}
