/**
 * roadsDistanceService.ts
 *
 * Calculates the actual road distance traveled by a vehicle from a set of
 * raw GPS coordinates using the Google Roads API and Routes API.
 *
 * Pipeline:
 *   1. Validate & deduplicate raw GPS points
 *   2. Detect GPS gaps > maxGapMeters → split into separate segments
 *   3. Batch each segment into ≤100-point chunks with 5-point overlap
 *   4. Call snapToRoads (Roads API) with interpolate=true per batch
 *   5. Deduplicate overlapping snapped points across batches
 *   6. Sum Haversine distances across all interpolated snapped points → actualDistanceMeters
 *   7. (Optional) Call computeRoutes (Routes API) origin→destination → plannedDistanceMeters
 *
 * Fallback chain: Roads API failure → raw Haversine over the original points
 * Routes API failure → plannedDistanceMeters = 0 (non-fatal)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GpsPoint {
  lat: number;
  lng: number;
  timestamp?: number; // Unix ms (optional)
}

export interface DistanceResult {
  /** Actual road distance in metres, following the snapped GPS path */
  actualDistanceMeters: number;
  /** Planned straight O→D road distance from Routes API (0 if unavailable) */
  plannedDistanceMeters: number;
  /** All snapped + interpolated points returned by the Roads API */
  snappedPath: GpsPoint[];
  /** Human-readable warnings (gaps, API fallbacks, filtered points, etc.) */
  warnings: string[];
}

export interface RoadsApiOptions {
  /** Points farther apart than this trigger a segment split (default: 300 m) */
  maxGapMeters?: number;
  /** Minimum distance between two points to not be considered jitter (default: 5 m) */
  minJitterMeters?: number;
  /** Also call Routes API for planned O→D distance (default: true) */
  includeRoutesApi?: boolean;
  /** Max retry attempts for OVER_QUERY_LIMIT / 429 responses (default: 3) */
  maxRetries?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ROADS_API_URL = 'https://roads.googleapis.com/v1/snapToRoads';
const ROUTES_API_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const BATCH_SIZE = 100;
const BATCH_OVERLAP = 5;
const DEFAULT_MAX_GAP_M = 300;
const DEFAULT_MIN_JITTER_M = 5;

// ─── Public Entry Point ───────────────────────────────────────────────────────

/**
 * Compute the actual road distance traveled from an array of raw GPS points.
 *
 * @param rawPoints  Array of GPS fixes collected during the trip.
 * @param apiKey     Google Maps API key (must have Roads API + Routes API enabled).
 * @param options    Tuning parameters (see RoadsApiOptions).
 * @returns          DistanceResult with actual/planned distances, snapped path, and warnings.
 */
export async function computeTravelDistance(
  rawPoints: GpsPoint[],
  apiKey: string,
  options: RoadsApiOptions = {}
): Promise<DistanceResult> {
  const {
    maxGapMeters = DEFAULT_MAX_GAP_M,
    minJitterMeters = DEFAULT_MIN_JITTER_M,
    includeRoutesApi = true,
    maxRetries = 3,
  } = options;

  const warnings: string[] = [];

  // ── 1. Validate input ───────────────────────────────────────────────────
  if (!rawPoints || rawPoints.length === 0) {
    throw new Error('[RoadsDistanceService] Input points array is empty or null.');
  }

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('[RoadsDistanceService] Google Maps API key is required.');
  }

  if (rawPoints.length === 1) {
    warnings.push('Only a single GPS point provided — distance is 0.');
    return { actualDistanceMeters: 0, plannedDistanceMeters: 0, snappedPath: [], warnings };
  }

  // ── 2. Filter bad coordinates ────────────────────────────────────────────
  const { valid: cleanPoints, badCount } = filterInvalidPoints(rawPoints);
  if (badCount > 0) {
    warnings.push(`${badCount} point(s) with invalid coordinates (NaN/Infinity) were removed.`);
  }
  if (cleanPoints.length < 2) {
    warnings.push('Fewer than 2 valid points after filtering — distance is 0.');
    return { actualDistanceMeters: 0, plannedDistanceMeters: 0, snappedPath: [], warnings };
  }

  // ── 3. Deduplicate GPS jitter ────────────────────────────────────────────
  const deduped = deduplicatePoints(cleanPoints, minJitterMeters);
  if (deduped.length < cleanPoints.length) {
    warnings.push(
      `${cleanPoints.length - deduped.length} near-duplicate point(s) removed (< ${minJitterMeters} m apart).`
    );
  }

  // ── 4. Segment by GPS gap ────────────────────────────────────────────────
  const { segments, gapWarnings } = segmentByGap(deduped, maxGapMeters);
  warnings.push(...gapWarnings);

  // ── 5. Snap each segment to roads ────────────────────────────────────────
  let allSnapped: GpsPoint[] = [];
  let usedFallback = false;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.length < 2) {
      // Single isolated point after gap split — skip snapping
      allSnapped.push(...seg);
      continue;
    }

    try {
      const snapped = await snapSegment(seg, apiKey, maxRetries, warnings);
      // Avoid duplicate junction point between consecutive segments
      if (i > 0 && allSnapped.length > 0) {
        allSnapped.push(...snapped.slice(1));
      } else {
        allSnapped.push(...snapped);
      }
    } catch (err) {
      // Roads API completely failed for this segment — fall back to raw points
      usedFallback = true;
      warnings.push(
        `Roads API failed for segment ${i + 1}/${segments.length}: ${(err as Error).message}. Using raw GPS points.`
      );
      if (i > 0 && allSnapped.length > 0) {
        allSnapped.push(...seg.slice(1));
      } else {
        allSnapped.push(...seg);
      }
    }
  }

  if (usedFallback) {
    warnings.push('Actual distance may be less accurate due to Roads API fallback.');
  }

  // ── 6. Calculate cumulative distance ──────────────────────────────────────
  const actualDistanceMeters = calcHaversineChain(allSnapped);

  // ── 7. Planned route distance (Routes API) ────────────────────────────────
  let plannedDistanceMeters = 0;
  if (includeRoutesApi && deduped.length >= 2) {
    const origin = deduped[0];
    const destination = deduped[deduped.length - 1];
    try {
      plannedDistanceMeters = await fetchPlannedRoute(origin, destination, apiKey);
    } catch (err) {
      warnings.push(`Routes API failed (planned distance unavailable): ${(err as Error).message}`);
    }
  }

  return {
    actualDistanceMeters: Math.round(actualDistanceMeters),
    plannedDistanceMeters: Math.round(plannedDistanceMeters),
    snappedPath: allSnapped,
    warnings,
  };
}

// ─── Internal: Input Validation ───────────────────────────────────────────────

function filterInvalidPoints(points: GpsPoint[]): { valid: GpsPoint[]; badCount: number } {
  const valid: GpsPoint[] = [];
  let badCount = 0;

  for (const p of points) {
    if (
      typeof p.lat !== 'number' ||
      typeof p.lng !== 'number' ||
      !isFinite(p.lat) ||
      !isFinite(p.lng) ||
      p.lat < -90 || p.lat > 90 ||
      p.lng < -180 || p.lng > 180
    ) {
      badCount++;
    } else {
      valid.push(p);
    }
  }
  return { valid, badCount };
}

// ─── Internal: Deduplication ──────────────────────────────────────────────────

function deduplicatePoints(points: GpsPoint[], minDistM: number): GpsPoint[] {
  if (points.length === 0) return [];
  const result: GpsPoint[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const dist = haversineMeters(prev, points[i]);
    if (dist >= minDistM) {
      result.push(points[i]);
    }
  }
  return result;
}

// ─── Internal: Gap Segmentation ───────────────────────────────────────────────

function segmentByGap(
  points: GpsPoint[],
  maxGapM: number
): { segments: GpsPoint[][]; gapWarnings: string[] } {
  const segments: GpsPoint[][] = [];
  const gapWarnings: string[] = [];
  let current: GpsPoint[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const gap = haversineMeters(points[i - 1], points[i]);
    if (gap > maxGapM) {
      gapWarnings.push(
        `GPS gap detected between point ${i - 1} and ${i} (${Math.round(gap)} m > ${maxGapM} m threshold). ` +
        `Splitting into separate segment for snap quality.`
      );
      segments.push(current);
      current = [points[i]];
    } else {
      current.push(points[i]);
    }
  }
  segments.push(current);
  return { segments, gapWarnings };
}

// ─── Internal: Batching + Roads API ──────────────────────────────────────────

/**
 * Snap a single segment (possibly > 100 pts) to roads using overlapping batches.
 */
async function snapSegment(
  segment: GpsPoint[],
  apiKey: string,
  maxRetries: number,
  warnings: string[]
): Promise<GpsPoint[]> {
  if (segment.length <= BATCH_SIZE) {
    // Single batch — simple path
    return snapBatch(segment, apiKey, maxRetries, warnings);
  }

  // Multiple batches with BATCH_OVERLAP-point overlap to preserve continuity
  const snappedAll: GpsPoint[] = [];
  let batchIndex = 0;

  for (let start = 0; start < segment.length; start += BATCH_SIZE - BATCH_OVERLAP) {
    const end = Math.min(start + BATCH_SIZE, segment.length);
    const batch = segment.slice(start, end);

    const snapped = await snapBatch(batch, apiKey, maxRetries, warnings);

    if (batchIndex === 0) {
      snappedAll.push(...snapped);
    } else {
      // Discard the first BATCH_OVERLAP points of each subsequent batch — they
      // were the overlap points already added in the previous batch's tail.
      // Find the first snapped point that doesn't duplicate the last already-added point.
      let skipUntil = 0;
      if (snappedAll.length > 0 && snapped.length > 0) {
        const lastAdded = snappedAll[snappedAll.length - 1];
        for (let j = 0; j < snapped.length; j++) {
          if (haversineMeters(lastAdded, snapped[j]) > 1) { // > 1 m → not a duplicate
            skipUntil = j;
            break;
          }
          skipUntil = j + 1;
        }
      }
      snappedAll.push(...snapped.slice(skipUntil));
    }

    batchIndex++;
    if (end === segment.length) break;
  }

  return snappedAll;
}

/**
 * Make a single snapToRoads API call.
 * Implements exponential back-off for OVER_QUERY_LIMIT (429 / 429-like).
 * Falls back to returning raw points if retries are exhausted.
 */
async function snapBatch(
  points: GpsPoint[],
  apiKey: string,
  maxRetries: number,
  warnings: string[]
): Promise<GpsPoint[]> {
  if (points.length === 0) return [];

  const path = points.map((p) => `${p.lat},${p.lng}`).join('|');
  const url = `${ROADS_API_URL}?path=${encodeURIComponent(path)}&interpolate=true&key=${apiKey}`;

  let attempt = 0;
  let delayMs = 1000;

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url);

      // Handle rate-limit response codes
      if (response.status === 429 || response.status === 403) {
        if (attempt < maxRetries) {
          warnings.push(
            `Roads API rate-limited (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delayMs / 1000}s…`
          );
          await sleep(delayMs);
          delayMs *= 2; // Exponential back-off
          attempt++;
          continue;
        } else {
          warnings.push(
            `Roads API rate-limit exceeded after ${maxRetries + 1} attempts. Using raw GPS for this batch.`
          );
          return points; // Fallback: return unsnapped raw points
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as {
        snappedPoints?: Array<{ location: { latitude: number; longitude: number } }>;
        error?: { message: string; status: string };
        warningMessage?: string;
      };

      // API-level quota error
      if (data.error) {
        const status = data.error.status ?? '';
        if (status === 'OVER_QUERY_LIMIT' || status === 'RESOURCE_EXHAUSTED') {
          if (attempt < maxRetries) {
            warnings.push(
              `Roads API OVER_QUERY_LIMIT (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delayMs / 1000}s…`
            );
            await sleep(delayMs);
            delayMs *= 2;
            attempt++;
            continue;
          } else {
            warnings.push(
              `Roads API quota exhausted after ${maxRetries + 1} attempts. Using raw GPS for this batch.`
            );
            return points;
          }
        }
        throw new Error(`Roads API error [${status}]: ${data.error.message}`);
      }

      if (data.warningMessage) {
        warnings.push(`Roads API warning: ${data.warningMessage}`);
      }

      if (!data.snappedPoints || data.snappedPoints.length === 0) {
        warnings.push('Roads API returned no snapped points for a batch. Using raw GPS points.');
        return points;
      }

      return data.snappedPoints.map((sp) => ({
        lat: sp.location.latitude,
        lng: sp.location.longitude,
      }));
    } catch (err) {
      if (attempt < maxRetries) {
        warnings.push(
          `Roads API network error (attempt ${attempt + 1}/${maxRetries + 1}): ${(err as Error).message}. Retrying…`
        );
        await sleep(delayMs);
        delayMs *= 2;
        attempt++;
      } else {
        throw err; // Re-throw — caller decides whether to use fallback
      }
    }
  }

  // Should never reach here, but satisfy TypeScript
  return points;
}

// ─── Internal: Routes API ────────────────────────────────────────────────────

/**
 * Call the Routes API computeRoutes to get the ideal driving distance
 * between the trip's origin and destination.
 *
 * @returns Distance in metres, or throws on failure.
 */
async function fetchPlannedRoute(
  origin: GpsPoint,
  destination: GpsPoint,
  apiKey: string
): Promise<number> {
  const body = {
    origin: {
      location: { latLng: { latitude: origin.lat, longitude: origin.lng } },
    },
    destination: {
      location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
    },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_UNAWARE',
  };

  const response = await fetch(ROUTES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      // Only request the distance field to minimise payload and billing
      'X-Goog-FieldMask': 'routes.distanceMeters',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Routes API HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json() as {
    routes?: Array<{ distanceMeters?: number }>;
    error?: { message: string; status: string };
  };

  if (data.error) {
    throw new Error(`Routes API error [${data.error.status}]: ${data.error.message}`);
  }

  const distanceMeters = data.routes?.[0]?.distanceMeters;
  if (typeof distanceMeters !== 'number') {
    throw new Error('Routes API returned no distance data.');
  }

  return distanceMeters;
}

// ─── Internal: Haversine ─────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6_371_000;

/**
 * Calculate the Haversine (great-circle) distance between two GPS points in metres.
 * No external dependencies required.
 */
export function haversineMeters(p1: GpsPoint, p2: GpsPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * Sum Haversine distances across a chain of GPS points (metres).
 */
export function calcHaversineChain(points: GpsPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Convenience: Convert metres to km / miles ────────────────────────────────

export function metersToKm(meters: number): number {
  return Math.round((meters / 1000) * 100) / 100;
}

export function metersToMiles(meters: number): number {
  return Math.round((meters / 1609.344) * 100) / 100;
}

/**
 * Calculate the percentage deviation of actual vs planned distance.
 * Returns a positive number if actual > planned (overshoot / detour).
 */
export function deviationPercent(actualM: number, plannedM: number): number {
  if (plannedM === 0) return 0;
  return Math.round(((actualM - plannedM) / plannedM) * 100 * 10) / 10;
}
