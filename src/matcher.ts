import { vehicleCache, listingCountMap } from './cache';
import { parseDescription } from './parser';

interface MatchResult {
  vehicleId: string | null;
  confidence: number;
}

// Weights sum to 10
const WEIGHTS = {
  make:             2,
  model:            2,
  badge:            3,
  fuelType:         1,
  transmissionType: 1,
  driveType:        1,
};

export async function findBestMatch(
  attrs: ReturnType<typeof parseDescription>
): Promise<MatchResult> {
  // Early‐filter in the in‐memory cache
  let candidates = vehicleCache;
  if (attrs.make && attrs.model) {
    candidates = vehicleCache.filter(v =>
      v.make.toLowerCase()  === attrs.make &&
      v.model.toLowerCase() === attrs.model
    );
  }

  // Fallback to whole cache if filter sees nothing
  if (candidates.length === 0) {
    candidates = vehicleCache;
  }

  let bestVehicle = null;
  let bestScore   = -Infinity;

  for (const v of vehicleCache) {
    let score = 0;

    if (attrs.make && v.make.toLowerCase() === attrs.make)            
      score += WEIGHTS.make;

    if (attrs.model && v.model.toLowerCase() === attrs.model)         
      score += WEIGHTS.model;

    if (attrs.badge) {
      const re = new RegExp(`\\b${attrs.badge.toLowerCase()}\\b`);
      if (re.test(v.badge.toLowerCase())) score += WEIGHTS.badge;
    }

    if (attrs.fuelType && v.fuelType.toLowerCase() === attrs.fuelType)
      score += WEIGHTS.fuelType;

    if (
      attrs.transmissionType &&
      v.transmissionType.toLowerCase() === attrs.transmissionType
    )
      score += WEIGHTS.transmissionType;

    if (attrs.driveType && v.driveType === attrs.driveType)           
      score += WEIGHTS.driveType;

    if (score > bestScore) {
      bestScore   = score;
      bestVehicle = v;
    } else if (score === bestScore && bestVehicle) {
      const countA = listingCountMap[v.id]           || 0;
      const countB = listingCountMap[bestVehicle.id] || 0;
      if (countA > countB) bestVehicle = v;
    }
  }

  return {
    vehicleId:  bestVehicle?.id ?? null,
    confidence: Math.max(0, Math.min(10, bestScore)),
  };
}
