export interface LottieAnimation {
  v: string;
  fr: number;
  ip: number;
  op: number;
  w: number;
  h: number;
  nm?: string;
  ddd?: number;
  assets?: Asset[];
  layers?: Layer[];
  markers?: unknown[];
  fonts?: unknown;
  chars?: unknown[];
  meta?: unknown;
  [key: string]: unknown;
}

interface Asset {
  id: string;
  w?: number;
  h?: number;
  u?: string;
  p?: string;
  e?: number;
  layers?: Layer[];
  [key: string]: unknown;
}

interface Layer {
  ddd?: number;
  ind?: number;
  ty?: number;
  nm?: string;
  sr?: number;
  ks?: Transform;
  ao?: number;
  shapes?: Shape[];
  ip?: number;
  op?: number;
  st?: number;
  bm?: number;
  [key: string]: unknown;
}

interface Transform {
  o?: AnimatedProperty;
  r?: AnimatedProperty;
  p?: AnimatedProperty;
  a?: AnimatedProperty;
  s?: AnimatedProperty;
  [key: string]: unknown;
}

interface AnimatedProperty {
  a?: number;
  k?: unknown;
  ix?: number;
  [key: string]: unknown;
}

interface Shape {
  ty?: string;
  nm?: string;
  [key: string]: unknown;
}

export interface OptimizationOptions {
  removeHiddenLayers: boolean;
  roundDecimals: boolean;
  decimalPrecision: number;
  removeMetadata: boolean;
  removeEmptyGroups: boolean;
  simplifyKeyframes: boolean;
  removeDefaultValues: boolean;
  compressImages: boolean;
  // Aggressive options (off by default)
  removeExpressions: boolean;
  removeEffects: boolean;
  collapseTransforms: boolean;
  collapseDuplicateKeyframes: boolean;
}

export const defaultOptions: OptimizationOptions = {
  removeHiddenLayers: true,
  roundDecimals: true,
  decimalPrecision: 2,
  removeMetadata: true,
  removeEmptyGroups: true,
  simplifyKeyframes: true,
  removeDefaultValues: true,
  compressImages: true,
  // Aggressive options (off by default)
  removeExpressions: false,
  removeEffects: false,
  collapseTransforms: false,
  collapseDuplicateKeyframes: false,
};

export interface OptimizationResult {
  originalSize: number;
  optimizedSize: number;
  savings: number;
  savingsPercentage: number;
  optimizedAnimation: LottieAnimation;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function roundNumber(num: number, precision: number): number {
  const multiplier = Math.pow(10, precision);
  return Math.round(num * multiplier) / multiplier;
}

function roundDecimals(obj: unknown, precision: number): unknown {
  if (typeof obj === 'number') {
    return roundNumber(obj, precision);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => roundDecimals(item, precision));
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = roundDecimals(value, precision);
    }
    return result;
  }
  return obj;
}

function removeUnnecessaryProperties(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(item => removeUnnecessaryProperties(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
      if (value === undefined || value === null) continue;
      if (key === 'mn' || key === 'ln' || key === 'cl') continue;
      if (key === 'nm' && typeof value === 'string') {
        continue;
      }
      if (key === 'ix' && typeof value === 'number') continue;
      if (key === 'cix' && typeof value === 'number') continue;
      if (key === 'bm' && value === 0) continue;
      if (key === 'ddd' && value === 0) continue;
      if (key === 'ao' && value === 0) continue;
      if (key === 'sr' && value === 1) continue;
      if (key === 'hd' && value === false) continue;

      result[key] = removeUnnecessaryProperties(value);
    }
    return result;
  }
  return obj;
}

function removeHiddenLayers(animation: LottieAnimation): LottieAnimation {
  const result = deepClone(animation);

  function filterLayers(layers?: Layer[]): Layer[] | undefined {
    if (!layers) return layers;
    return layers.filter(layer => {
      if ((layer as Record<string, unknown>).hd === true) return false;
      if (layer.ty === 3) return false;
      return true;
    });
  }

  result.layers = filterLayers(result.layers);

  if (result.assets) {
    result.assets = result.assets.map(asset => {
      if (asset.layers) {
        return { ...asset, layers: filterLayers(asset.layers) };
      }
      return asset;
    });
  }

  return result;
}

function simplifyKeyframes(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(item => simplifyKeyframes(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
      if (key === 'k' && Array.isArray(value) && value.length > 0) {
        const keyframes = value as Record<string, unknown>[];
        if (keyframes[0] && typeof keyframes[0] === 'object' && 't' in keyframes[0]) {
          const simplified = keyframes.map(kf => {
            const newKf: Record<string, unknown> = {};
            for (const [kfKey, kfValue] of Object.entries(kf)) {
              if (kfKey === 'i' || kfKey === 'o') {
                const bezier = kfValue as { x: number | number[]; y: number | number[] };
                if (bezier && typeof bezier === 'object') {
                  const x = Array.isArray(bezier.x) ? bezier.x[0] : bezier.x;
                  const y = Array.isArray(bezier.y) ? bezier.y[0] : bezier.y;
                  if (Math.abs(x - 0.5) < 0.01 && Math.abs(y - 0.5) < 0.01) {
                    continue;
                  }
                }
              }
              newKf[kfKey] = kfValue;
            }
            return newKf;
          });
          result[key] = simplified;
          continue;
        }
      }
      result[key] = simplifyKeyframes(value);
    }
    return result;
  }
  return obj;
}

function removeEmptyGroups(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj
      .map(item => removeEmptyGroups(item))
      .filter(item => {
        if (item !== null && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          if (record.ty === 'gr' && Array.isArray(record.it) && record.it.length <= 1) {
            return false;
          }
        }
        return true;
      });
  }
  if (obj !== null && typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      result[key] = removeEmptyGroups(value);
    }
    return result;
  }
  return obj;
}

function removeMetadata(animation: LottieAnimation): LottieAnimation {
  const result = deepClone(animation);

  delete result.meta;
  delete result.markers;
  delete result.fonts;
  delete result.chars;

  const keysToRemove = ['__typename', 'created', 'modified', 'author', 'description'];
  keysToRemove.forEach(key => delete result[key]);

  return result;
}

function compressBase64Images(animation: LottieAnimation): LottieAnimation {
  const result = deepClone(animation);

  if (result.assets) {
    result.assets = result.assets.map(asset => {
      if (asset.p && typeof asset.p === 'string' && asset.p.startsWith('data:image')) {
        return asset;
      }
      return asset;
    });
  }

  return result;
}

// ── Aggressive optimizations ──

/**
 * Remove all expression code (`x` properties) from animated values.
 * Expressions are After Effects scripts embedded in the animation.
 * Removing them breaks expression-driven animations but can save
 * significant space on expression-heavy files.
 */
function removeExpressions(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(item => removeExpressions(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (key === 'x' && typeof value === 'string') continue;
      result[key] = removeExpressions(value);
    }
    return result;
  }
  return obj;
}

/**
 * Remove all effects (`ef` arrays) from layers.
 * Effects include blur, glow, drop shadow, color correction, etc.
 * Removing them strips visual post-processing but can cut size
 * substantially on effects-heavy animations.
 */
function removeEffects(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(item => removeEffects(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (key === 'ef' && Array.isArray(value)) continue;
      result[key] = removeEffects(value);
    }
    return result;
  }
  return obj;
}

/**
 * Remove non-animated transform sub-properties that are at their
 * identity/default values. For example, if rotation is static at 0,
 * or opacity is static at 100, that property can be removed from the
 * transform entirely since the renderer defaults to those values.
 */
function collapseTransforms(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(item => collapseTransforms(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
      if (key === 'ks' && value && typeof value === 'object' && !Array.isArray(value)) {
        const transform = value as Record<string, unknown>;
        const newTransform: Record<string, unknown> = {};

        for (const [tKey, tValue] of Object.entries(transform)) {
          if (tValue && typeof tValue === 'object' && !Array.isArray(tValue)) {
            const prop = tValue as Record<string, unknown>;
            if (prop.a === 0 || prop.a === undefined) {
              const k = prop.k;
              const isDefault =
                (tKey === 'o' && (k === 100 || (Array.isArray(k) && k.length === 1 && k[0] === 100))) ||
                (tKey === 'r' && (k === 0 || (Array.isArray(k) && k.length === 1 && k[0] === 0))) ||
                (tKey === 'p' && Array.isArray(k) && k.every((v: unknown) => v === 0)) ||
                (tKey === 'a' && Array.isArray(k) && k.every((v: unknown) => v === 0)) ||
                (tKey === 's' && Array.isArray(k) && k.every((v: unknown) => v === 100));
              if (isDefault) continue;
            }
          }
          newTransform[tKey] = collapseTransforms(tValue);
        }

        result[key] = newTransform;
        continue;
      }
      result[key] = collapseTransforms(value);
    }
    return result;
  }
  return obj;
}

/**
 * Convert animated properties to static when every keyframe holds the
 * same value. This is common with design tools that export animated
 * properties even when nothing actually changes over time.
 */
function collapseDuplicateKeyframes(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(item => collapseDuplicateKeyframes(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
      result[key] = collapseDuplicateKeyframes(value);
    }

    // Check if this object is an animated property where all keyframes
    // share the same value, and collapse it to a static property.
    if (result.a === 1 && Array.isArray(result.k)) {
      const kfs = result.k as Record<string, unknown>[];
      if (kfs.length > 0 && kfs[0] && typeof kfs[0] === 'object' && 't' in kfs[0]) {
        const values = kfs
          .filter(kf => kf.s !== undefined)
          .map(kf => JSON.stringify(kf.s));
        if (values.length > 0 && values.every(v => v === values[0])) {
          return { a: 0, k: kfs[0].s };
        }
      }
    }

    return result;
  }
  return obj;
}

function removeUnusedAssets(animation: LottieAnimation): LottieAnimation {
  const result = deepClone(animation);

  if (!result.assets || !result.layers) return result;

  const usedAssetIds = new Set<string>();

  function findUsedAssets(obj: unknown): void {
    if (Array.isArray(obj)) {
      obj.forEach(item => findUsedAssets(item));
    } else if (obj !== null && typeof obj === 'object') {
      const record = obj as Record<string, unknown>;
      if (record.refId && typeof record.refId === 'string') {
        usedAssetIds.add(record.refId);
      }
      Object.values(record).forEach(value => findUsedAssets(value));
    }
  }

  findUsedAssets(result.layers);

  usedAssetIds.forEach(id => {
    const asset = result.assets?.find(a => a.id === id);
    if (asset?.layers) {
      findUsedAssets(asset.layers);
    }
  });

  result.assets = result.assets.filter(asset => usedAssetIds.has(asset.id));

  return result;
}

export function optimizeLottie(
  animation: LottieAnimation,
  options: OptimizationOptions = defaultOptions
): OptimizationResult {
  const originalJson = JSON.stringify(animation);
  const originalSize = new Blob([originalJson]).size;

  let optimized = deepClone(animation);

  if (options.removeMetadata) {
    optimized = removeMetadata(optimized);
  }

  if (options.removeHiddenLayers) {
    optimized = removeHiddenLayers(optimized);
  }

  optimized = removeUnusedAssets(optimized);

  if (options.removeEmptyGroups) {
    optimized = removeEmptyGroups(optimized) as LottieAnimation;
  }

  if (options.simplifyKeyframes) {
    optimized = simplifyKeyframes(optimized) as LottieAnimation;
  }

  if (options.removeDefaultValues) {
    optimized = removeUnnecessaryProperties(optimized) as LottieAnimation;
  }

  if (options.roundDecimals) {
    optimized = roundDecimals(optimized, options.decimalPrecision) as LottieAnimation;
  }

  if (options.compressImages) {
    optimized = compressBase64Images(optimized);
  }

  if (options.removeExpressions) {
    optimized = removeExpressions(optimized) as LottieAnimation;
  }

  if (options.removeEffects) {
    optimized = removeEffects(optimized) as LottieAnimation;
  }

  if (options.collapseTransforms) {
    optimized = collapseTransforms(optimized) as LottieAnimation;
  }

  if (options.collapseDuplicateKeyframes) {
    optimized = collapseDuplicateKeyframes(optimized) as LottieAnimation;
  }

  const optimizedJson = JSON.stringify(optimized);
  const optimizedSize = new Blob([optimizedJson]).size;

  const savings = originalSize - optimizedSize;
  const savingsPercentage = (savings / originalSize) * 100;

  return {
    originalSize,
    optimizedSize,
    savings,
    savingsPercentage,
    optimizedAnimation: optimized,
  };
}

export function validateLottie(json: unknown): json is LottieAnimation {
  if (!json || typeof json !== 'object') return false;
  const obj = json as Record<string, unknown>;

  if (typeof obj.v !== 'string') return false;
  if (typeof obj.fr !== 'number') return false;
  if (typeof obj.ip !== 'number') return false;
  if (typeof obj.op !== 'number') return false;
  if (typeof obj.w !== 'number') return false;
  if (typeof obj.h !== 'number') return false;

  return true;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1000;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
