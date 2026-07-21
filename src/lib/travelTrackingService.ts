/**
 * travelTrackingService.ts
 *
 * Manages outside-office attendance travel tracking.
 * Uses the browser's watchPosition API with a hybrid threshold:
 *   - Store if >= 5 minutes since last breadcrumb  (time threshold)
 *   - OR store if >= 100 meters moved (distance threshold)
 *
 * This mimics what Uber/Google Maps use to balance accuracy vs battery/data.
 */

import { supabase } from './supabase';
import { calculateDistance } from './locationService';

// Thresholds
const TIME_THRESHOLD_MS   = 5 * 60 * 1000; // 5 minutes
const DIST_THRESHOLD_M    = 100;            // 100 meters
const MIN_ACCURACY_M      = 150;            // Ignore GPS fixes worse than 150m accuracy

export interface TravelSession {
  timestampId: string;
  employeeId: string;
  tenantId: string;
  startTime: number; // Date.now() when tracking started
}

export interface TravelSummary {
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  breadcrumbCount: number;
}

export interface TravelBreadcrumb {
  id: string;
  latitude: number;
  longitude: number;
  cumulative_distance_meters: number;
  recorded_at: string;
}

// --- Internal state (module-scoped, survives re-renders) ---
let watchId: number | null = null;
let activeSession: TravelSession | null = null;
let lastStoredLat: number | null = null;
let lastStoredLng: number | null = null;
let lastStoredTime: number = 0;
let cumulativeDistance: number = 0;
let sessionStartTime: number = 0;

// Internal callback — use registerDistanceCallback() from outside the module
let _distanceCallback: ((meters: number) => void) | null = null;

/**
 * Register a UI callback to receive live distance updates.
 * Call this in a React useEffect and unregister on cleanup.
 */
export function registerDistanceCallback(cb: (meters: number) => void): void {
  _distanceCallback = cb;
}

/**
 * Unregister the live distance callback.
 */
export function unregisterDistanceCallback(): void {
  _distanceCallback = null;
}

/**
 * Start tracking an employee's travel.
 * Call this immediately after a successful Outside-Office clock-IN.
 */
export function startTravelTracking(session: TravelSession): void {
  // Stop any existing session first
  stopTravelTracking(false);

  activeSession = session;
  cumulativeDistance = 0;
  sessionStartTime = Date.now();
  lastStoredTime = Date.now();
  lastStoredLat = null;
  lastStoredLng = null;

  if (!navigator.geolocation) {
    console.warn('[TravelTracking] Geolocation not available.');
    return;
  }

  watchId = navigator.geolocation.watchPosition(
    handlePositionUpdate,
    (err) => {
      console.warn('[TravelTracking] GPS error:', err.message);
    },
    {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 10000,
    }
  );

  console.log(`[TravelTracking] Started for timestamp ${session.timestampId}`);
}

/**
 * Stop tracking and optionally write the final summary.
 */
export async function stopTravelTracking(writeSummary: boolean = true): Promise<TravelSummary | null> {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  if (!activeSession || !writeSummary) {
    activeSession = null;
    return null;
  }

  const durationSeconds = Math.round((Date.now() - sessionStartTime) / 1000);
  const summary: TravelSummary = {
    totalDistanceMeters: Math.round(cumulativeDistance),
    totalDurationSeconds: durationSeconds,
    breadcrumbCount: 0, // informational only
  };

  // Write the final summary back to the attendance_timestamp row
  const { error } = await supabase
    .from('attendance_timestamp')
    .update({
      travel_distance_meters: summary.totalDistanceMeters,
      travel_duration_seconds: summary.totalDurationSeconds,
    })
    .eq('id', activeSession.timestampId)
    .eq('tenant_id', activeSession.tenantId);

  if (error) {
    console.error('[TravelTracking] Failed to write summary:', error.message);
  } else {
    console.log(`[TravelTracking] Summary written — ${summary.totalDistanceMeters}m in ${durationSeconds}s`);
  }

  activeSession = null;
  return summary;
}

/**
 * Fetch all breadcrumbs for a given IN timestamp (for the route map viewer).
 */
export async function getTravelLogs(
  startTimestampId: string
): Promise<TravelBreadcrumb[]> {
  const { data, error } = await supabase
    .from('attendance_travel_logs')
    .select('id, latitude, longitude, cumulative_distance_meters, recorded_at')
    .eq('start_timestamp_id', startTimestampId)
    .order('recorded_at', { ascending: true });

  if (error) {
    console.error('[TravelTracking] Failed to fetch logs:', error.message);
    return [];
  }

  return (data || []).map(row => ({
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    cumulative_distance_meters: Number(row.cumulative_distance_meters),
  }));
}

/**
 * Check if travel tracking is currently active.
 */
export function isTravelTrackingActive(): boolean {
  return watchId !== null && activeSession !== null;
}

/**
 * Get the current active session info.
 */
export function getActiveSession(): TravelSession | null {
  return activeSession;
}

// --- Internal: Called by watchPosition on every GPS update ---
async function handlePositionUpdate(position: GeolocationPosition): Promise<void> {
  if (!activeSession) return;

  const { latitude, longitude, accuracy } = position.coords;
  const now = Date.now();

  // Ignore poor accuracy fixes
  if (accuracy > MIN_ACCURACY_M) {
    console.log(`[TravelTracking] Skipping fix: accuracy ${accuracy.toFixed(0)}m is too low.`);
    return;
  }

  const timeSinceLast = now - lastStoredTime;

  // Calculate distance moved since last stored point
  let distanceMoved = 0;
  if (lastStoredLat !== null && lastStoredLng !== null) {
    distanceMoved = calculateDistance(lastStoredLat, lastStoredLng, latitude, longitude);
  }

  // Hybrid threshold: store if enough time OR enough distance has passed
  const shouldStore =
    lastStoredLat === null || // Always store the very first fix
    timeSinceLast >= TIME_THRESHOLD_MS ||
    distanceMoved >= DIST_THRESHOLD_M;

  if (!shouldStore) return;

  // Update running totals
  cumulativeDistance += distanceMoved;

  // Notify UI for live badge update
  if (_distanceCallback) {
    _distanceCallback(cumulativeDistance);
  }

  // Update last stored state
  lastStoredLat = latitude;
  lastStoredLng = longitude;
  lastStoredTime = now;

  // Insert breadcrumb into database
  const { error } = await supabase
    .from('attendance_travel_logs')
    .insert({
      tenant_id: activeSession.tenantId,
      employee_id: activeSession.employeeId,
      start_timestamp_id: activeSession.timestampId,
      latitude,
      longitude,
      accuracy,
      cumulative_distance_meters: Math.round(cumulativeDistance),
    });

  if (error) {
    console.error('[TravelTracking] Failed to insert breadcrumb:', error.message);
  } else {
    console.log(`[TravelTracking] Breadcrumb stored — cumulative: ${cumulativeDistance.toFixed(0)}m`);
  }
}
