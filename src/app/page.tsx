'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import JSZip from 'jszip';
import LottiePreview from '@/components/LottiePreview';
import {
  LottieAnimation,
  OptimizationOptions,
  OptimizationResult,
  defaultOptions,
  optimizeLottie,
  validateLottie,
  formatBytes,
} from '@/lib/lottie-optimizer';
import './olive.css';

/* ── Color utilities ── */

function lottieColorToHex(c: number[]): string {
  const r = Math.round((c[0] ?? 0) * 255);
  const g = Math.round((c[1] ?? 0) * 255);
  const b = Math.round((c[2] ?? 0) * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hexToLottieColor(hex: string): number[] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b, 1];
}

function isStaticColor(k: unknown): k is number[] {
  return Array.isArray(k) && k.length >= 3 && k.length <= 4
    && typeof k[0] === 'number' && k.every((v: unknown) => typeof v === 'number' && v >= 0 && v <= 1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractColors(obj: any, colors: Set<string> = new Set()): string[] {
  if (!obj || typeof obj !== 'object') return Array.from(colors);

  if ((obj.ty === 'fl' || obj.ty === 'st') && obj.c) {
    const c = obj.c;
    if (isStaticColor(c.k)) {
      colors.add(lottieColorToHex(c.k));
    } else if (Array.isArray(c.k)) {
      for (const kf of c.k) {
        if (kf && typeof kf === 'object') {
          if (isStaticColor(kf.s)) colors.add(lottieColorToHex(kf.s));
          if (isStaticColor(kf.e)) colors.add(lottieColorToHex(kf.e));
        }
      }
    }
  }

  if (typeof obj.sc === 'string' && obj.sc.startsWith('#')) {
    colors.add(obj.sc.slice(0, 7).toLowerCase());
  }

  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) extractColors(item, colors);
    } else if (val && typeof val === 'object') {
      extractColors(val, colors);
    }
  }

  return Array.from(colors);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkAndReplace(obj: any, overrides: Record<string, string>): void {
  if (!obj || typeof obj !== 'object') return;

  if ((obj.ty === 'fl' || obj.ty === 'st') && obj.c) {
    const c = obj.c;
    if (isStaticColor(c.k)) {
      const hex = lottieColorToHex(c.k);
      if (overrides[hex]) c.k = hexToLottieColor(overrides[hex]);
    } else if (Array.isArray(c.k)) {
      for (const kf of c.k) {
        if (kf && typeof kf === 'object') {
          if (isStaticColor(kf.s)) {
            const hex = lottieColorToHex(kf.s);
            if (overrides[hex]) kf.s = hexToLottieColor(overrides[hex]);
          }
          if (isStaticColor(kf.e)) {
            const hex = lottieColorToHex(kf.e);
            if (overrides[hex]) kf.e = hexToLottieColor(overrides[hex]);
          }
        }
      }
    }
  }

  if (typeof obj.sc === 'string' && obj.sc.startsWith('#')) {
    const hex = obj.sc.slice(0, 7).toLowerCase();
    if (overrides[hex]) obj.sc = overrides[hex];
  }

  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) walkAndReplace(item, overrides);
    } else if (val && typeof val === 'object') {
      walkAndReplace(val, overrides);
    }
  }
}

function applyColorOverrides(animation: LottieAnimation, overrides: Record<string, string>): LottieAnimation {
  if (Object.keys(overrides).length === 0) return animation;
  const clone = JSON.parse(JSON.stringify(animation));
  walkAndReplace(clone, overrides);
  return clone;
}

/* ── Components ── */

interface LottieItem {
  id: string;
  fileName: string;
  fileSize: number;
  originalAnimation: LottieAnimation;
  result: OptimizationResult;
}

function OptRow({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="ba-opt">
      <span className="ba-opt-label">{label}</span>
      <div className="ba-toggle">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="ba-toggle-track" />
      </div>
    </label>
  );
}

export default function Home() {
  const [items, setItems] = useState<LottieItem[]>([]);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [options, setOptions] = useState<OptimizationOptions>(defaultOptions);
  const [isDragging, setIsDragging] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [statsOpen, setStatsOpen] = useState(true);
  const [safeOpen, setSafeOpen] = useState(true);
  const [aggressiveOpen, setAggressiveOpen] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [previewBg, setPreviewBg] = useState('');
  const [bgHexInput, setBgHexInput] = useState('');
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>({});
  const [appliedColors, setAppliedColors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const active = items.find(i => i.id === activeId);

  const activeColors = useMemo(() => {
    if (!active) return [];
    return extractColors(active.result.optimizedAnimation);
  }, [active]);

  const coloredOptimized = useMemo(() => {
    if (!active) return null;
    return applyColorOverrides(active.result.optimizedAnimation, appliedColors);
  }, [active, appliedColors]);

  /* Pre-compute exact download data — same string for size display AND download */
  const downloadData = useMemo(() => {
    const map = new Map<string, { json: string; size: number }>();
    for (const item of items) {
      const anim = applyColorOverrides(item.result.optimizedAnimation, appliedColors);
      const json = JSON.stringify(anim);
      map.set(item.id, { json, size: new Blob([json]).size });
    }
    return map;
  }, [items, appliedColors]);

  const processFiles = useCallback(async (files: File[]) => {
    setError('');
    setIsProcessing(true);
    const newItems: LottieItem[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        const text = await file.text();
        let json: unknown;
        try { json = JSON.parse(text); } catch { errors.push(`${file.name}: Invalid JSON`); continue; }
        if (!validateLottie(json)) { errors.push(`${file.name}: Not valid Lottie`); continue; }
        const result = optimizeLottie(json, options);
        newItems.push({ id: crypto.randomUUID(), fileName: file.name, fileSize: file.size, originalAnimation: json, result });
      } catch { errors.push(`${file.name}: Failed`); }
    }
    if (newItems.length > 0) {
      setItems(prev => [...prev, ...newItems]);
      if (!activeId) setActiveId(newItems[0].id);
    }
    if (errors.length > 0) setError(errors.join('. '));
    setIsProcessing(false);
  }, [options, activeId]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) processFiles(files);
    if (e.target) e.target.value = '';
  }, [processFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.json'));
    if (files.length > 0) processFiles(files); else setError('Drop .json files');
  }, [processFiles]);

  const handleDownload = useCallback((item: LottieItem) => {
    const data = downloadData.get(item.id);
    if (!data) return;
    const blob = new Blob([data.json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = item.fileName.replace('.json', '-optimized.json');
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [downloadData]);

  const handleDownloadAll = useCallback(async () => {
    const zip = new JSZip();
    for (const item of items) {
      const data = downloadData.get(item.id);
      if (!data) continue;
      const name = item.fileName.replace('.json', '-optimized.json');
      zip.file(name, data.json);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'lottie-optimized.zip';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [items, downloadData]);

  const removeItem = useCallback((id: string) => {
    setItems(prev => {
      const next = prev.filter(i => i.id !== id);
      if (activeId === id) setActiveId(next.length > 0 ? next[0].id : null);
      return next;
    });
  }, [activeId]);

  const opt = useCallback((key: keyof OptimizationOptions, value: boolean | number) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  }, []);

  const regenerate = useCallback(() => {
    if (items.length === 0) return;
    setIsProcessing(true);
    setTimeout(() => {
      setItems(prev => prev.map(item => ({ ...item, result: optimizeLottie(item.originalAnimation, options) })));
      setAppliedColors({ ...colorOverrides });
      setPreviewKey(k => k + 1);
      setIsProcessing(false);
    }, 100);
  }, [items, options, colorOverrides]);

  const resetAll = useCallback(() => {
    setItems([]); setError(''); setActiveId(null); setColorOverrides({}); setAppliedColors({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const totalOriginal = items.reduce((s, i) => s + i.fileSize, 0);
  const totalOptimized = items.reduce((s, i) => s + (downloadData.get(i.id)?.size ?? 0), 0);
  const totalPct = totalOriginal > 0 ? ((totalOriginal - totalOptimized) / totalOriginal) * 100 : 0;
  const hasItems = items.length > 0;
  const hasColorOverrides = Object.keys(colorOverrides).length > 0;
  const hasPendingColors = JSON.stringify(colorOverrides) !== JSON.stringify(appliedColors);
  const activeOptSize = active ? (downloadData.get(active.id)?.size ?? 0) : 0;
  const activePct = active && active.fileSize > 0
    ? ((active.fileSize - activeOptSize) / active.fileSize) * 100 : 0;

  return (
    <div className="ba-page">
      <div className="ba-topbar">
        <div className="ba-brand">
          <div className="ba-brand-icon">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
          </div>
          Lottie Optimizer
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {hasItems && (
            <>
              <button onClick={handleDownloadAll} className="ba-btn--outline">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Export all
              </button>
              <button onClick={resetAll} className="ba-btn--ghost">Clear</button>
            </>
          )}
        </div>
      </div>

      <div className="ba-shell">
        <div className="ba-sidebar">
          <div className="ba-sidebar-head">
            <span className="ba-label">Files</span>
            <button className="ba-btn--ghost" onClick={() => fileInputRef.current?.click()} style={{ padding: '2px 6px' }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </button>
          </div>
          <div className="ba-sidebar-scroll">
            {hasItems ? (
              <div>
                {items.map(item => (
                  <div
                    key={item.id}
                    className={`ba-file ${activeId === item.id ? 'ba-file--active' : ''}`}
                    onClick={() => setActiveId(item.id)}
                  >
                    <div className="ba-file-dot" />
                    <span className="ba-file-name">{item.fileName}</span>
                    <span className="ba-file-badge">-{(((item.fileSize - (downloadData.get(item.id)?.size ?? 0)) / item.fileSize) * 100).toFixed(0)}%</span>
                    <button
                      className="ba-file-close"
                      onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                    >
                      <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '20px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: '12px', color: 'var(--bn-ink-4)', lineHeight: 1.6 }}>
                  No files yet. Drop .json files or click + to add.
                </p>
              </div>
            )}
          </div>
          <div className="ba-status">
            <div className="ba-status-dot" />
            <span>Ready</span>
            <span>&middot;</span>
            <span>All local</span>
            {hasItems && (
              <>
                <span>&middot;</span>
                <span>{items.length} file{items.length !== 1 ? 's' : ''}</span>
              </>
            )}
          </div>
        </div>

        <div
          className="ba-workspace"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {error && (
            <div className="ba-error" style={{ maxWidth: '600px', width: '100%', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" strokeWidth="1.5" /><path strokeLinecap="round" strokeWidth="1.5" d="M12 8v4m0 4h.01" /></svg>
              {error}
            </div>
          )}

          {!hasItems ? (
            <div style={{ maxWidth: '400px', textAlign: 'center' }}>
              <div className="ba-anim ba-d1" style={{ marginBottom: '20px' }}>
                <div style={{ width: '52px', height: '52px', margin: '0 auto', background: 'var(--bn-white)', border: '1px solid var(--bn-border)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-md)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--bn-ink-3)" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </div>
              </div>
              <h2 className="ba-anim ba-d2" style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '8px', color: 'var(--bn-ink)' }}>
                Optimize your animations
              </h2>
              <p className="ba-anim ba-d3" style={{ fontSize: '13px', color: 'var(--bn-ink-3)', lineHeight: 1.7, marginBottom: '24px' }}>
                Drop Lottie JSON files to shrink them without losing quality. Everything runs locally in your browser.
              </p>
              <div
                className={`ba-drop ba-anim ba-d4 ${isDragging ? 'ba-drop--active' : ''}`}
                style={{ padding: '40px 24px' }}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--bn-ink-4)', margin: '0 auto 12px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--bn-ink-2)', marginBottom: '4px' }}>
                  Drop .json files here
                </p>
                <p style={{ fontSize: '12px', color: 'var(--bn-ink-4)' }}>
                  or <button className="ba-btn--link" style={{ fontSize: '12px' }} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>browse from your computer</button>
                </p>
              </div>
            </div>
          ) : active ? (
            <div style={{ maxWidth: '680px', width: '100%' }}>
              <div className="ba-anim ba-d1" style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
                <div>
                  <div className="ba-label" style={{ marginBottom: '4px' }}>Original</div>
                  <div className="ba-mono" style={{ fontSize: '16px', fontWeight: 600, color: 'var(--bn-ink)' }}>{formatBytes(active.fileSize)}</div>
                </div>
                <div>
                  <div className="ba-label" style={{ marginBottom: '4px' }}>Optimized</div>
                  <div className="ba-mono" style={{ fontSize: '16px', fontWeight: 600, color: 'var(--bn-green)' }}>{formatBytes(activeOptSize)}</div>
                </div>
                <div>
                  <div className="ba-label" style={{ marginBottom: '4px' }}>Reduction</div>
                  <div className="ba-mono" style={{ fontSize: '16px', fontWeight: 600, color: 'var(--bn-blue)' }}>{activePct.toFixed(1)}%</div>
                </div>
              </div>

              <div className="ba-anim ba-d2" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span className="ba-mono" style={{ fontSize: '11px', color: 'var(--bn-ink-3)' }}>
                    {formatBytes(active.fileSize)} &rarr; {formatBytes(activeOptSize)}
                  </span>
                  <span className="ba-mono" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--bn-blue)' }}>
                    {activePct.toFixed(1)}% smaller
                  </span>
                </div>
                <div className="ba-progress">
                  <div className="ba-progress-fill" style={{ width: `${activePct}%` }} />
                </div>
              </div>

              <div className="ba-compare ba-anim ba-d3" style={{ marginBottom: '20px' }}>
                <div className="ba-preview-card">
                  <div className="ba-preview-head">
                    <span className="ba-label">Original</span>
                    <span className="ba-mono" style={{ fontSize: '11px', color: 'var(--bn-ink-4)' }}>{formatBytes(active.fileSize)}</span>
                  </div>
                  <div className={`ba-preview-well${previewBg === 'checker' ? ' ba-preview-well--checker' : ''}`} style={previewBg && previewBg !== 'checker' ? { background: previewBg } : undefined}>
                    <LottiePreview key={`orig-${active.id}-${previewKey}`} animationData={active.originalAnimation} className="max-w-full max-h-full" />
                  </div>
                </div>

                <div className="ba-preview-card ba-preview-card--opt">
                  <div className="ba-preview-head">
                    <span className="ba-label" style={{ color: 'var(--bn-blue)' }}>Optimized</span>
                    <span className="ba-mono" style={{ fontSize: '11px', color: 'var(--bn-green)' }}>{formatBytes(activeOptSize)}</span>
                  </div>
                  <div className={`ba-preview-well${previewBg === 'checker' ? ' ba-preview-well--checker' : ''}`} style={previewBg && previewBg !== 'checker' ? { background: previewBg } : undefined}>
                    <LottiePreview key={`opt-${active.id}-${previewKey}`} animationData={coloredOptimized ?? active.result.optimizedAnimation} className="max-w-full max-h-full" />
                  </div>
                </div>
              </div>

              <div className="ba-anim ba-d4" style={{ display: 'flex', justifyContent: 'center' }}>
                <button onClick={() => handleDownload(active)} className="ba-btn">
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download optimized
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="ba-inspector">
          <div className="ba-inspector-scroll">
          <div className="ba-inspector-section">
            <button className="ba-section-toggle" onClick={() => setStatsOpen(v => !v)}>
              <span className="ba-label">Stats</span>
              <svg className={`ba-chevron ${statsOpen ? 'ba-chevron--open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {statsOpen && (
              active ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: 'var(--bn-ink-3)' }}>Original size</span>
                    <span className="ba-mono" style={{ fontSize: '12px', fontWeight: 500, color: 'var(--bn-ink)' }}>{formatBytes(active.fileSize)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: 'var(--bn-ink-3)' }}>Optimized</span>
                    <span className="ba-mono" style={{ fontSize: '12px', fontWeight: 500, color: 'var(--bn-green)' }}>{formatBytes(activeOptSize)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: 'var(--bn-ink-3)' }}>Reduction</span>
                    <span className="ba-mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--bn-blue)' }}>{activePct.toFixed(1)}%</span>
                  </div>
                  {items.length > 1 && (
                    <div style={{ marginTop: '4px', paddingTop: '8px', borderTop: '1px solid var(--bn-border-dim)', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '11px', color: 'var(--bn-ink-4)' }}>Total ({items.length} files)</span>
                      <span className="ba-mono" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--bn-blue)' }}>{totalPct.toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: 'var(--bn-ink-4)', marginTop: '10px' }}>No file selected</p>
              )
            )}
          </div>

          <div className="ba-inspector-section">
            <button className="ba-section-toggle" onClick={() => setSafeOpen(v => !v)}>
              <span className="ba-label">Safe optimizations</span>
              <svg className={`ba-chevron ${safeOpen ? 'ba-chevron--open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {safeOpen && (
              <div style={{ marginTop: '8px' }}>
                <OptRow label="Remove hidden layers" checked={options.removeHiddenLayers} onChange={(v) => opt('removeHiddenLayers', v)} />
                <OptRow label="Remove metadata" checked={options.removeMetadata} onChange={(v) => opt('removeMetadata', v)} />
                <OptRow label="Remove empty groups" checked={options.removeEmptyGroups} onChange={(v) => opt('removeEmptyGroups', v)} />
                <OptRow label="Simplify keyframes" checked={options.simplifyKeyframes} onChange={(v) => opt('simplifyKeyframes', v)} />
                <OptRow label="Remove default values" checked={options.removeDefaultValues} onChange={(v) => opt('removeDefaultValues', v)} />
                <OptRow label="Round decimals" checked={options.roundDecimals} onChange={(v) => opt('roundDecimals', v)} />

                {options.roundDecimals && (
                  <div style={{ marginTop: '6px', padding: '8px 10px', background: 'var(--bn-surface)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span className="ba-mono" style={{ fontSize: '11px', color: 'var(--bn-ink-3)' }}>Precision</span>
                    </div>
                    <div className="ba-precision-steps">
                      {[0, 1, 2, 3, 4].map(v => (
                        <button
                          key={v}
                          className={`ba-precision-step ${options.decimalPrecision === v ? 'ba-precision-step--active' : ''}`}
                          onClick={() => opt('decimalPrecision', v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="ba-inspector-section">
            <button className="ba-section-toggle" onClick={() => setAggressiveOpen(v => !v)}>
              <span className="ba-label">Aggressive</span>
              <svg className={`ba-chevron ${aggressiveOpen ? 'ba-chevron--open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {aggressiveOpen && (
              <div style={{ marginTop: '8px' }}>
                <OptRow label="Remove expressions" checked={options.removeExpressions} onChange={(v) => opt('removeExpressions', v)} />
                <OptRow label="Remove effects" checked={options.removeEffects} onChange={(v) => opt('removeEffects', v)} />
                <OptRow label="Collapse transforms" checked={options.collapseTransforms} onChange={(v) => opt('collapseTransforms', v)} />
                <OptRow label="Collapse static keyframes" checked={options.collapseDuplicateKeyframes} onChange={(v) => opt('collapseDuplicateKeyframes', v)} />
              </div>
            )}
          </div>

          <div className="ba-inspector-section">
            <button className="ba-section-toggle" onClick={() => setColorsOpen(v => !v)}>
              <span className="ba-label">Colors</span>
              <svg className={`ba-chevron ${colorsOpen ? 'ba-chevron--open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {colorsOpen && (
              <div style={{ marginTop: '10px' }}>
                {active && activeColors.length > 0 ? (
                  <>
                    <div className="ba-color-grid">
                      {activeColors.map(hex => (
                        <label key={hex} className="ba-color-row">
                          <div className="ba-color-swatch" style={{ background: hex }} />
                          <span className="ba-mono" style={{ fontSize: '11px', color: 'var(--bn-ink-3)', flex: 1 }}>
                            {hex.toUpperCase()}
                          </span>
                          <svg width="10" height="10" fill="none" stroke="var(--bn-ink-4)" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path strokeLinecap="round" strokeWidth="2" d="M8 4l8 8-8 8" /></svg>
                          <div className="ba-color-swatch" style={{ background: colorOverrides[hex] || hex, borderColor: colorOverrides[hex] ? 'var(--bn-blue)' : undefined }} />
                          <input
                            type="color"
                            value={colorOverrides[hex] || hex}
                            onChange={(e) => {
                              const newHex = e.target.value.toLowerCase();
                              setColorOverrides(prev => {
                                if (newHex === hex) {
                                  const next = { ...prev };
                                  delete next[hex];
                                  return next;
                                }
                                return { ...prev, [hex]: newHex };
                              });
                            }}
                            className="ba-color-input"
                          />
                        </label>
                      ))}
                    </div>
                    {hasPendingColors && (
                      <p style={{ marginTop: '8px', fontSize: '11px', color: 'var(--bn-orange)', textAlign: 'center' }}>
                        Click Re-generate to apply
                      </p>
                    )}
                    {hasColorOverrides && (
                      <button
                        className="ba-btn--ghost"
                        style={{ marginTop: '6px', width: '100%', justifyContent: 'center', fontSize: '11px' }}
                        onClick={() => { setColorOverrides({}); setAppliedColors({}); setPreviewKey(k => k + 1); }}
                      >
                        Reset colors
                      </button>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: '12px', color: 'var(--bn-ink-4)' }}>
                    {active ? 'No colors found' : 'No file selected'}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="ba-inspector-section">
            <button className="ba-section-toggle" onClick={() => setBgOpen(v => !v)}>
              <span className="ba-label">Background</span>
              <svg className={`ba-chevron ${bgOpen ? 'ba-chevron--open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {bgOpen && (
              <div style={{ marginTop: '10px' }}>
                <div className="ba-bg-presets">
                  {[
                    { value: '', icon: true },
                    { value: '#ffffff' },
                    { value: '#000000' },
                    { value: '#f5f5f5' },
                    { value: '#1a1a1a' },
                    { value: 'checker' },
                  ].map(p => (
                    <button
                      key={p.value}
                      className={`ba-bg-preset${previewBg === p.value ? ' ba-bg-preset--active' : ''}${p.value === 'checker' ? ' ba-bg-preset--checker' : ''}${p.icon ? ' ba-bg-preset--default' : ''}`}
                      style={p.value && p.value !== 'checker' && !p.icon ? { background: p.value } : undefined}
                      onClick={() => {
                        setPreviewBg(p.value);
                        setBgHexInput(p.value === 'checker' || !p.value ? '' : p.value.replace('#', ''));
                      }}
                      title={p.icon ? 'Default' : p.value}
                    >
                      {p.icon && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M5.5 5.5l13 13" /></svg>}
                    </button>
                  ))}
                </div>

                <div className="ba-bg-custom">
                  <div className="ba-bg-picker-wrap">
                    <input
                      type="color"
                      value={previewBg && previewBg !== 'checker' ? previewBg : '#f7f5f0'}
                      onChange={(e) => {
                        const hex = e.target.value.toLowerCase();
                        setPreviewBg(hex);
                        setBgHexInput(hex.replace('#', ''));
                      }}
                      className="ba-bg-picker"
                    />
                  </div>
                  <div className="ba-bg-hex-wrap">
                    <span className="ba-bg-hash">#</span>
                    <input
                      type="text"
                      value={bgHexInput}
                      placeholder="hex"
                      maxLength={6}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
                        setBgHexInput(raw);
                        if (raw.length === 6) setPreviewBg(`#${raw.toLowerCase()}`);
                        if (raw.length === 0) setPreviewBg('');
                      }}
                      className="ba-bg-hex"
                    />
                  </div>
                </div>

                {previewBg && (
                  <button
                    className="ba-btn--ghost"
                    style={{ marginTop: '6px', width: '100%', justifyContent: 'center', fontSize: '11px' }}
                    onClick={() => { setPreviewBg(''); setBgHexInput(''); }}
                  >
                    Reset
                  </button>
                )}
              </div>
            )}
          </div>
          </div>

          <div className="ba-inspector-footer">
            <button onClick={regenerate} disabled={isProcessing || !hasItems} className="ba-btn" style={{ width: '100%', justifyContent: 'center' }}>
              {isProcessing ? 'Generating...' : 'Re-generate'}
            </button>
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".json" multiple onChange={handleFileChange} style={{ display: 'none' }} />
    </div>
  );
}
