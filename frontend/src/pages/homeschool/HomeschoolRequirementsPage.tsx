// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * HomeschoolRequirementsPage
 *
 * Architecture:
 *   - state_reporting sets are seeded globally (is_global=TRUE) for ~15 states.
 *     When a parent selects their state, the matching global set is shown
 *     automatically — no upload required.
 *   - If their state isn't covered yet (or they want a custom override), they
 *     can upload their own document via the ExtractionWizard.
 *   - state_standards (TEKS, NGSS, etc.) are separate and shown in their own section.
 *   - All sets show expiry badges, processing status, and re-upload affordance.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtDate } from '@/utils/date';
import { ExtractionWizard } from '@/components/shared/ExtractionWizard';
import { useTranslation } from 'react-i18next';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StandardsSet {
  id: string;
  name: string;
  description: string;
  type: string;
  state_code: string | null;
  is_global: boolean;
  criteria_count: number;
  processing_status: 'pending' | 'processing' | 'complete' | 'failed';
  last_processed_at: string | null;
  valid_until: string | null;
  is_expired: boolean;
  days_until_expiry: number | null;
  created_at: string;
}

// ── US state list ─────────────────────────────────────────────────────────────

const US_STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
  ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
  ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
  ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
  ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
  ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
  ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
  ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
  ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
];

const SEEDED_STATES = new Set(['TX','IL','CA','FL','NC','GA','VA','OH','NY','PA','TN']);

// ── Helpers ───────────────────────────────────────────────────────────────────

const LS_STATE_KEY = 'hs_state_code';

function authHeader(): Record<string, string> {
  const t = localStorage.getItem('auth_token');
  return t
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }
    : { 'Content-Type': 'application/json' };
}

function ExpiryBadge({ set }: { set: StandardsSet }) {
  const { t } = useTranslation('landing');
  if (!set.valid_until) return null;
  if (set.is_expired) return (
    <span style={{ fontSize:'0.7rem',fontWeight:700,padding:'2px 8px',borderRadius:20,background:'#fee2e2',color:'#b91c1c' }}>{t('pages_homeschool_homeschoolrequirementspage.expired', 'EXPIRED')}</span>
  );
  const days = set.days_until_expiry ?? 999;
  return (
    <span style={{ fontSize:'0.7rem',fontWeight:700,padding:'2px 8px',borderRadius:20,
      background: days<=30 ? '#fef9c3' : '#dcfce7', color: days<=30 ? '#a16207' : '#15803d' }}>
      Valid until {fmtDate(set.valid_until)}{days<=30 ? ` (${days}d)` : ''}
    </span>
  );
}

function ProcessingBadge({ status }: { status: string }) {
  const map: Record<string,{bg:string;color:string;label:string}> = {
    pending:    {bg:'#e0f2fe',color:'#0369a1',label:'⏳ Queued'},
    processing: {bg:'#fef9c3',color:'#a16207',label:'⚙️ Processing…'},
    complete:   {bg:'#dcfce7',color:'#15803d',label:'✓ Ready'},
    failed:     {bg:'#fee2e2',color:'#b91c1c',label:'✗ Failed'},
  };
  const s = map[status] ?? map.complete;
  return (
    <span style={{ fontSize:'0.7rem',fontWeight:700,padding:'2px 8px',borderRadius:20,background:s.bg,color:s.color }}>
      {s.label}
    </span>
  );
}

// ── Set card ──────────────────────────────────────────────────────────────────

function SetCard({ set, onDelete, onRefresh, onCoverage }: {
  set: StandardsSet;
  onDelete: (id:string,name:string)=>void;
  onRefresh: (id:string)=>void;
  onCoverage: ()=>void;
}) {
  const { t } = useTranslation('landing');
  const nearExpiry = !set.is_expired && (set.days_until_expiry??999) <= 30;
  return (
    <div style={{
      padding:'16px 20px',
      background: set.is_expired ? '#fff7f7' : 'var(--surface)',
      border:`1px solid ${set.is_expired?'#fecdd3':'var(--border)'}`,
      borderRadius:12,
    }}>
      <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{fontWeight:600,fontSize:'0.95rem'}}>{set.name}</span>
            {set.is_global && (
              <span style={{fontSize:'0.68rem',fontWeight:700,padding:'1px 7px',borderRadius:20,background:'#dbeafe',color:'#1d4ed8'}}>{t('pages_homeschool_homeschoolrequirementspage.shared', 'SHARED')}</span>
            )}
            {set.state_code && (
              <span style={{fontSize:'0.68rem',fontWeight:700,padding:'1px 7px',borderRadius:20,background:'#f3f4f6',color:'#374151'}}>
                {set.state_code}
              </span>
            )}
          </div>
          {set.description && (
            <div style={{color:'var(--text-muted)',fontSize:'0.8rem',marginTop:4}}>{set.description}</div>
          )}
          <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap',alignItems:'center'}}>
            <ProcessingBadge status={set.processing_status} />
            <ExpiryBadge set={set} />
            <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
              {set.criteria_count} criteria · {set.is_global ? 'Shared system set' : `Added ${fmtDate(set.created_at)}`}
            </span>
          </div>
        </div>
        <div style={{display:'flex',gap:8,flexShrink:0,flexWrap:'wrap'}}>
          <button onClick={onCoverage} style={{padding:'5px 12px',borderRadius:8,cursor:'pointer',fontSize:'0.8rem',fontWeight:600,border:'1px solid var(--primary)',color:'var(--primary)',background:'transparent'}}>{t('pages_homeschool_homeschoolrequirementspage.coverage', 'Coverage')}</button>
          {(set.is_expired || nearExpiry) && (
            <button onClick={()=>onRefresh(set.id)} style={{padding:'5px 12px',borderRadius:8,cursor:'pointer',fontSize:'0.8rem',fontWeight:600,border:'1px solid #f59e0b',color:'#b45309',background:'#fffbeb'}}>
              Re-upload
            </button>
          )}
          {!set.is_global && (
            <button onClick={()=>onDelete(set.id,set.name)} style={{padding:'5px 10px',borderRadius:8,cursor:'pointer',fontSize:'0.75rem',border:'1px solid #fecdd3',color:'#be123c',background:'none'}}>
              Delete
            </button>
          )}
        </div>
      </div>
      {(set.is_expired || nearExpiry) && (
        <div style={{marginTop:12,padding:'8px 12px',borderRadius:8,fontSize:'0.8rem',
          background:set.is_expired?'#fee2e2':'#fef9c3',color:set.is_expired?'#b91c1c':'#a16207'}}>
          {set.is_expired
            ? '⚠️ This set has expired. Re-upload to verify it is still current. If the file is unchanged, processing is skipped.'
            : `⏰ Expires in ${set.days_until_expiry} days. Consider re-uploading to extend the validity window.`}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type WizardMode = { type: 'state_standards' | 'state_reporting' } | null;

export const HomeschoolRequirementsPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [sets, setSets]       = useState<StandardsSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizard, setWizard]   = useState<WizardMode>(null);
  const [stateCode, setStateCode] = useState<string>(
    () => localStorage.getItem(LS_STATE_KEY) || ''
  );

  const load = () => {
    setLoading(true);
    fetch('/api/v1/standards?include_expired=true', { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then((all: StandardsSet[]) =>
        setSets(all.filter(s => s.type === 'state_standards' || s.type === 'state_reporting'))
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleStateChange = (code: string) => {
    setStateCode(code);
    localStorage.setItem(LS_STATE_KEY, code);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    await fetch(`/api/v1/standards/${id}`, { method:'DELETE', headers:authHeader() });
    load();
  };

  const handleSave = async (payload: any, type: string) => {
    const res = await fetch('/api/v1/standards', {
      method:'POST', headers:authHeader(),
      body:JSON.stringify({ ...payload, type, is_global:false }),
    });
    if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.detail||'Save failed'); }
    return (await res.json()).id;
  };

  // Split sets by type
  const standards = sets.filter(s => s.type === 'state_standards');

  // For reporting: show global set matching selected state first, then personal sets
  const globalReportingForState = stateCode
    ? sets.filter(s => s.type==='state_reporting' && s.is_global && s.state_code===stateCode)
    : [];
  const personalReporting = sets.filter(s => s.type==='state_reporting' && !s.is_global);
  const reporting = [...globalReportingForState, ...personalReporting];

  const stateIsSeeded = SEEDED_STATES.has(stateCode);
  const stateHasGlobal = globalReportingForState.length > 0;

  if (wizard) {
    const isReporting = wizard.type === 'state_reporting';
    return (
      <ExtractionWizard
        setType={wizard.type}
        title={isReporting ? 'Import Reporting Requirements' : 'Import State Standards'}
        description={isReporting
          ? 'Upload your state\'s homeschool reporting requirements (PDF or CSV). Ollama extracts each requirement for review. Re-uploading the same file reuses the cached result instantly.'
          : 'Upload official state academic standards (PDF or CSV). Once extracted, they are available to all users for mapping to activities.'
        }
        onSave={(p) => handleSave(p, wizard.type)}
        onComplete={() => { setWizard(null); load(); }}
        onCancel={() => setWizard(null)}
      />
    );
  }

  if (loading) return <p style={{color:'var(--text-muted)',fontFamily:'var(--font-body)',padding:32}}>{t('pages_homeschool_homeschoolrequirementspage.loading', 'Loading…')}</p>;

  return (
    <div style={{fontFamily:'var(--font-body)',maxWidth:820}}>

      <div style={{marginBottom:28}}>
        <h1 style={{fontFamily:'var(--font-head)',marginBottom:6}}>{t('pages_homeschool_homeschoolrequirementspage.standards_requirements', 'Standards & Requirements')}</h1>
        <p style={{color:'var(--text-muted)',margin:0}}>{t('pages_homeschool_homeschoolrequirementspage.manage_the_academic_standards_and_report', 'Manage the academic standards and reporting requirements used in your coverage report.')}</p>
      </div>

      {/* ── State selector ─────────────────────────────────────────────────── */}
      <div style={{
        marginBottom:28,padding:'16px 20px',borderRadius:12,
        background:'var(--surface)',border:'1px solid var(--border)',
      }}>
        <label style={{display:'block',fontWeight:600,fontSize:'0.9rem',marginBottom:8}}>{t('pages_homeschool_homeschoolrequirementspage.your_state', 'Your state')}</label>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          <select
            value={stateCode}
            onChange={e => handleStateChange(e.target.value)}
            style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontSize:'0.9rem',minWidth:220}}
          >
            <option value="">{t('pages_homeschool_homeschoolrequirementspage.select_your_state', '— Select your state —')}</option>
            {US_STATES.map(([code,name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          {stateCode && (
            stateIsSeeded
              ? <span style={{fontSize:'0.8rem',color:'#15803d',fontWeight:600}}>✓ Requirements available for {stateCode}</span>
              : <span style={{fontSize:'0.8rem',color:'#a16207'}}>No pre-seeded requirements for {stateCode} yet — upload yours below.</span>
          )}
        </div>
      </div>

      {/* ── Reporting Requirements ─────────────────────────────────────────── */}
      <Section
        title={t('pages_homeschool_homeschoolrequirementspage.title_reporting_requirements', 'Reporting Requirements')}
        subtitle={
          stateCode && stateHasGlobal
            ? `Showing the shared requirements for ${stateCode}. These are seeded from state law and updated annually. Your personal uploads appear below.`
            : "Your state's homeschool annual reporting requirements — attendance, testing, portfolio, etc. Varies by state. Pre-seeded for 11 states; upload yours if not listed."
        }
        icon="📋"
        buttonLabel="+ Upload Custom Requirements"
        onAdd={() => setWizard({ type:'state_reporting' })}
        empty={reporting.length === 0}
        emptyText={
          stateCode
            ? `No requirements found for ${stateCode}. Upload your state's homeschool law requirements to track compliance.`
            : "Select your state above to see pre-seeded requirements, or upload a custom document."
        }
      >
        {reporting.map(s => (
          <SetCard key={s.id} set={s}
            onDelete={handleDelete}
            onRefresh={() => setWizard({ type:'state_reporting' })}
            onCoverage={() => navigate('/homeschool/coverage')}
          />
        ))}
      </Section>

      {/* ── State Academic Standards ───────────────────────────────────────── */}
      <Section
        title={t('pages_homeschool_homeschoolrequirementspage.title_state_academic_standards', 'State Academic Standards')}
        subtitle="Official academic standards for your state (TEKS, NGSS, Common Core, etc.). Shared globally — uploaded once and available to all users for mapping activities to specific standards."
        icon="📐"
        buttonLabel="+ Import Standards"
        onAdd={() => setWizard({ type:'state_standards' })}
        empty={standards.length === 0}
        emptyText="No state academic standards uploaded yet. Import your state's standards to map activities against specific criteria."
      >
        {standards.map(s => (
          <SetCard key={s.id} set={s}
            onDelete={handleDelete}
            onRefresh={() => setWizard({ type:'state_standards' })}
            onCoverage={() => navigate('/homeschool/coverage')}
          />
        ))}
      </Section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <div style={{marginTop:24,padding:'14px 18px',borderRadius:12,background:'var(--surface)',border:'1px solid var(--border)',fontSize:'0.8rem',color:'var(--text-muted)',lineHeight:1.6}}>
        <strong style={{color:'var(--text)'}}>How Ollama caching works</strong>
        <p style={{margin:'5px 0 0'}}>{t('pages_homeschool_homeschoolrequirementspage.when_you_upload_a_pdf_or_csv_ollama_extr', 'When you upload a PDF or CSV, Ollama extracts the criteria once and caches them. Re-uploading the same file skips Ollama entirely (checksum match). A different file triggers re-extraction. Pre-seeded state sets were hand-authored and are always instant. Sets expire annually — you\'ll see a warning near the expiry date.')}</p>
      </div>

    </div>
  );
};

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title,subtitle,icon,buttonLabel,onAdd,empty,emptyText,children }: {
  title:string; subtitle:string; icon:string; buttonLabel:string;
  onAdd:()=>void; empty:boolean; emptyText:string; children:React.ReactNode;
}) {
  return (
    <div style={{marginBottom:32}}>
      <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:12}}>
        <span style={{fontSize:'1.4rem',marginTop:2}}>{icon}</span>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:'1rem'}}>{title}</div>
          <div style={{color:'var(--text-muted)',fontSize:'0.8rem',marginTop:3}}>{subtitle}</div>
        </div>
        <button onClick={onAdd} style={{flexShrink:0,padding:'7px 14px',borderRadius:8,fontSize:'0.82rem',fontWeight:600,background:'var(--primary)',color:'white',border:'none',cursor:'pointer'}}>
          {buttonLabel}
        </button>
      </div>
      {empty ? (
        <div style={{padding:'24px 20px',textAlign:'center',background:'var(--surface)',border:'1px dashed var(--border)',borderRadius:12,color:'var(--text-muted)',fontSize:'0.85rem'}}>
          {emptyText}
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>{children}</div>
      )}
    </div>
  );
}

export default HomeschoolRequirementsPage;
