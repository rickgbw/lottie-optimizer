'use client';

import { useState, useCallback, useRef } from 'react';
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

interface LottieItem {
  id: string;
  fileName: string;
  originalAnimation: LottieAnimation;
  result: OptimizationResult;
}

function ToggleOption({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 p-3 rounded-xl cursor-pointer group hover:bg-white/[0.03] transition-colors">
      <div className="min-w-0">
        <p className="text-slate-200 font-medium text-sm group-hover:text-white transition-colors">{label}</p>
        <p className="text-slate-500 text-xs mt-0.5">{description}</p>
      </div>
      <div className="toggle-switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="toggle-slider" />
      </div>
    </label>
  );
}

export default function Home() {
  const [items, setItems] = useState<LottieItem[]>([]);
  const [error, setError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [options, setOptions] = useState<OptimizationOptions>(defaultOptions);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(async (files: File[]) => {
    setError('');
    setIsProcessing(true);

    const newItems: LottieItem[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const text = await file.text();
        let json: unknown;

        try {
          json = JSON.parse(text);
        } catch {
          errors.push(`${file.name}: Invalid JSON`);
          continue;
        }

        if (!validateLottie(json)) {
          errors.push(`${file.name}: Not a valid Lottie file`);
          continue;
        }

        const result = optimizeLottie(json, options);
        newItems.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          originalAnimation: json,
          result,
        });
      } catch {
        errors.push(`${file.name}: Failed to process`);
      }
    }

    if (newItems.length > 0) {
      setItems(prev => [...prev, ...newItems]);
    }
    if (errors.length > 0) {
      setError(errors.join('. '));
    }
    setIsProcessing(false);
  }, [options]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      processFiles(files);
    }
    if (e.target) e.target.value = '';
  }, [processFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.json'));
    if (files.length > 0) {
      processFiles(files);
    } else {
      setError('Please drop .json files');
    }
  }, [processFiles]);

  const handleDownload = useCallback((item: LottieItem) => {
    const blob = new Blob([JSON.stringify(item.result.optimizedAnimation)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.fileName.replace('.json', '-optimized.json');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleDownloadAll = useCallback(() => {
    for (const item of items) {
      handleDownload(item);
    }
  }, [items, handleDownload]);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const handleOptionChange = useCallback((key: keyof OptimizationOptions, value: boolean | number) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  }, []);

  const reoptimize = useCallback(() => {
    if (items.length === 0) return;
    setIsProcessing(true);
    setTimeout(() => {
      setItems(prev => prev.map(item => ({
        ...item,
        result: optimizeLottie(item.originalAnimation, options),
      })));
      setIsProcessing(false);
    }, 100);
  }, [items, options]);

  const resetAll = useCallback(() => {
    setItems([]);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const totalOriginal = items.reduce((sum, item) => sum + item.result.originalSize, 0);
  const totalOptimized = items.reduce((sum, item) => sum + item.result.optimizedSize, 0);
  const totalSavings = totalOriginal - totalOptimized;
  const totalPercentage = totalOriginal > 0 ? (totalSavings / totalOriginal) * 100 : 0;

  const hasItems = items.length > 0;

  return (
    <div className="min-h-screen animated-bg relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-[10%] w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl float-1" />
        <div className="absolute bottom-20 right-[15%] w-96 h-96 bg-cyan-500/8 rounded-full blur-3xl float-2" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-500/5 rounded-full blur-3xl" />
      </div>

      {!hasItems ? (
        /* ───── Full-screen starter state ───── */
        <div className="relative min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
          <header className="text-center mb-12 animate-fade-in-up">
            <h1 className="title-text text-6xl sm:text-7xl font-extrabold tracking-tight mb-5 relative inline-block">
              <span className="title-gradient">Lottie</span>
              <span className="title-outline ml-3">Optimizer</span>
              <div className="title-glow" />
            </h1>
            <p className="text-slate-400 text-base max-w-md mx-auto">
              Shrink your Lottie animations without losing quality. Everything runs locally in your browser.
            </p>
          </header>

          <div className="animate-fade-in-up-delay w-full max-w-2xl">
            <div
              className={`
                relative rounded-2xl p-16 text-center cursor-pointer
                transition-all duration-300 ease-out group
                ${isDragging
                  ? 'glass drop-active bg-indigo-500/10 scale-[1.01]'
                  : 'glass glass-hover'
                }
              `}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-5">
                <div className={`
                  w-20 h-20 rounded-2xl flex items-center justify-center
                  transition-all duration-300
                  ${isDragging
                    ? 'bg-indigo-500/20 scale-110'
                    : 'bg-white/[0.04] group-hover:bg-white/[0.07] group-hover:scale-105'
                  }
                `}>
                  <svg className={`w-9 h-9 transition-colors duration-300 ${isDragging ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <p className="text-white/90 font-semibold text-lg">
                    Drop your Lottie files here
                  </p>
                  <p className="text-slate-500 mt-1.5 text-sm">
                    or click to browse &middot; multiple files supported
                  </p>
                </div>
                <div className="flex items-center gap-2 text-slate-600 text-xs">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Files never leave your device
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-6 w-full max-w-2xl p-4 glass rounded-xl animate-fade-in-up" style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            </div>
          )}

          <footer className="absolute bottom-6 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-slate-600 text-xs">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              100% client-side &middot; No uploads &middot; No tracking
            </div>
          </footer>
        </div>
      ) : (
        /* ───── Results view ───── */
        <div className="relative max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          {/* Compact header */}
          <header className="text-center mb-8 animate-fade-in-up">
            <h1 className="title-text text-3xl sm:text-4xl font-extrabold tracking-tight relative inline-block">
              <span className="title-gradient">Lottie</span>
              <span className="title-outline ml-2">Optimizer</span>
              <div className="title-glow" />
            </h1>
          </header>

          <div className="space-y-6 animate-fade-in-up">
            {/* Top bar: file count + actions */}
            <div className="glass rounded-xl px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
                  <span className="text-indigo-400 font-bold text-sm">{items.length}</span>
                </div>
                <p className="text-white/90 font-medium text-sm">
                  {items.length === 1 ? '1 file' : `${items.length} files`}
                  <span className="text-slate-500 ml-1.5">&middot; {formatBytes(totalOriginal)} total</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-slate-400 hover:text-white text-sm rounded-lg hover:bg-white/[0.05] transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add more
                </button>
                <button
                  onClick={resetAll}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-slate-400 hover:text-white text-sm rounded-lg hover:bg-white/[0.05] transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear all
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Aggregate savings banner */}
            <div className="relative glass rounded-2xl overflow-hidden">
              <div className="shimmer absolute inset-0" />
              <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4 p-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-semibold">
                      Total saved {formatBytes(totalSavings)}
                      <span className="text-emerald-400 ml-1.5">({totalPercentage.toFixed(1)}%)</span>
                    </p>
                    <p className="text-slate-400 text-sm">
                      {formatBytes(totalOriginal)} &rarr; {formatBytes(totalOptimized)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleDownloadAll}
                  className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold text-sm transition-all hover:shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download all
                </button>
              </div>
            </div>

            {/* File cards */}
            <div className="space-y-5 animate-fade-in-up-delay">
              {items.map((item) => (
                <div key={item.id} className="glass rounded-2xl p-5">
                  {/* Card header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <p className="text-white/90 font-medium text-sm truncate">{item.fileName}</p>
                      <span className="text-emerald-400 text-xs font-medium flex-shrink-0">
                        -{item.result.savingsPercentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleDownload(item)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 hover:text-emerald-400 text-xs rounded-lg hover:bg-white/[0.05] transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download
                      </button>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="p-1.5 text-slate-600 hover:text-red-400 rounded-lg hover:bg-white/[0.05] transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Side-by-side previews */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                        <span className="text-slate-500 text-xs uppercase tracking-wide">Original</span>
                      </div>
                      <div className="aspect-square bg-black/30 rounded-xl overflow-hidden flex items-center justify-center ring-1 ring-white/[0.04]">
                        <LottiePreview animationData={item.originalAnimation} className="max-w-full max-h-full" />
                      </div>
                      <p className="text-slate-400 text-center mt-2 text-xs font-mono">
                        {formatBytes(item.result.originalSize)}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        <span className="text-slate-500 text-xs uppercase tracking-wide">Optimized</span>
                      </div>
                      <div className="aspect-square bg-black/30 rounded-xl overflow-hidden flex items-center justify-center ring-1 ring-white/[0.04]">
                        <LottiePreview animationData={item.result.optimizedAnimation} className="max-w-full max-h-full" />
                      </div>
                      <p className="text-center mt-2 text-xs font-mono">
                        <span className="text-emerald-400">{formatBytes(item.result.optimizedSize)}</span>
                        <span className="text-slate-400 ml-1.5">({item.result.savingsPercentage.toFixed(1)}% smaller)</span>
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Options panel */}
            <div className="glass rounded-2xl p-5 animate-fade-in-up-delay-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white/80 font-semibold text-sm tracking-wide uppercase flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  Options
                </h2>
                <button
                  onClick={reoptimize}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg font-medium text-sm transition-all hover:shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98]"
                >
                  {isProcessing ? (
                    <>
                      <svg className="w-4 h-4 spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Processing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Re-optimize all
                    </>
                  )}
                </button>
              </div>

              <p className="text-slate-600 text-xs uppercase tracking-wider mb-2 mx-3">Safe</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                <ToggleOption
                  label="Remove hidden layers"
                  description="Strip layers marked as hidden"
                  checked={options.removeHiddenLayers}
                  onChange={(v) => handleOptionChange('removeHiddenLayers', v)}
                />
                <ToggleOption
                  label="Remove metadata"
                  description="Strip meta, markers, fonts, chars"
                  checked={options.removeMetadata}
                  onChange={(v) => handleOptionChange('removeMetadata', v)}
                />
                <ToggleOption
                  label="Remove empty groups"
                  description="Eliminate groups with 1 or fewer items"
                  checked={options.removeEmptyGroups}
                  onChange={(v) => handleOptionChange('removeEmptyGroups', v)}
                />
                <ToggleOption
                  label="Simplify keyframes"
                  description="Remove redundant bezier handles"
                  checked={options.simplifyKeyframes}
                  onChange={(v) => handleOptionChange('simplifyKeyframes', v)}
                />
                <ToggleOption
                  label="Remove default values"
                  description="Strip properties at their defaults"
                  checked={options.removeDefaultValues}
                  onChange={(v) => handleOptionChange('removeDefaultValues', v)}
                />
                <ToggleOption
                  label="Round decimals"
                  description="Reduce floating point precision"
                  checked={options.roundDecimals}
                  onChange={(v) => handleOptionChange('roundDecimals', v)}
                />
              </div>

              {options.roundDecimals && (
                <div className="mt-2 mx-3 flex items-center gap-4 p-3 rounded-xl bg-white/[0.02]">
                  <label className="text-slate-400 text-sm">Precision:</label>
                  <input
                    type="range"
                    min="0"
                    max="4"
                    value={options.decimalPrecision}
                    onChange={(e) => handleOptionChange('decimalPrecision', parseInt(e.target.value))}
                    className="flex-1 max-w-[160px]"
                  />
                  <span className="text-indigo-400 font-mono text-sm font-semibold w-6 text-center">{options.decimalPrecision}</span>
                </div>
              )}

              <div className="mt-5 pt-4 border-t border-white/[0.05]">
                <p className="text-amber-500/80 text-xs uppercase tracking-wider mb-2 mx-3">Aggressive &mdash; may alter visuals</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  <ToggleOption
                    label="Remove expressions"
                    description="Strip embedded After Effects scripts"
                    checked={options.removeExpressions}
                    onChange={(v) => handleOptionChange('removeExpressions', v)}
                  />
                  <ToggleOption
                    label="Remove effects"
                    description="Strip blur, glow, shadows, color FX"
                    checked={options.removeEffects}
                    onChange={(v) => handleOptionChange('removeEffects', v)}
                  />
                  <ToggleOption
                    label="Collapse transforms"
                    description="Drop non-animated identity transforms"
                    checked={options.collapseTransforms}
                    onChange={(v) => handleOptionChange('collapseTransforms', v)}
                  />
                  <ToggleOption
                    label="Collapse static keyframes"
                    description="Convert constant animations to static"
                    checked={options.collapseDuplicateKeyframes}
                    onChange={(v) => handleOptionChange('collapseDuplicateKeyframes', v)}
                  />
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-6 p-4 glass rounded-xl animate-fade-in-up" style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            </div>
          )}

          <footer className="mt-16 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-slate-600 text-xs">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              100% client-side &middot; No uploads &middot; No tracking
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}
