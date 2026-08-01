/**
 * travelTrackingService.ts
 *
 * Manages outside-office attendance travel tracking.
 * Uses the browser's watchPosition API with a strict interval + stationary filter:
 *   - Wakes up exactly every X minutes (time threshold).
 *   - ONLY stores the point if distance moved is >= Y meters (distance threshold).
 *
 * Enterprise Features:
 *   - Offline Queue: If the network is unavailable, breadcrumbs are stored in
 *     localStorage and flushed automatically when connectivity is restored.
 *     This prevents data loss in dead zones (tunnels, basements, remote areas).
 *
 * This completely prevents database spam and battery drain while driving or stationary.
 */

import { supabase } from './supabase';
import { calculateDistance } from './locationService';
import { useSettingsStore } from '../stores/settingsStore';
import { computeTravelDistance } from './roadsDistanceService';

// Default Thresholds (if not provided by config)
const DEFAULT_TIME_THRESHOLD_MS   = 5 * 60 * 1000; // 5 minutes
const DEFAULT_DIST_THRESHOLD_M    = 100;            // 100 meters
const MIN_ACCURACY_M              = 2500;           // Relaxed accuracy limit for desktop browser testing

export interface TravelSession {
  timestampId: string;
  employeeId: string;
  tenantId: string;
  startTime: number; // Date.now() when tracking started
  intervalMins?: number;
  thresholdMeters?: number;
}

export interface TravelSummary {
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  breadcrumbCount: number;
  /** Planned origin→destination road distance from Routes API (0 if unavailable) */
  plannedDistanceMeters?: number;
  /** Warnings from the Roads API snap pipeline (GPS gaps, fallbacks, etc.) */
  roadsApiWarnings?: string[];
}

export interface TravelBreadcrumb {
  id: string;
  latitude: number;
  longitude: number;
  cumulative_distance_meters: number;
  recorded_at: string;
  speed_ms?: number | null; // Raw GPS speed in m/s; null if device cannot determine
}

/** Movement classification derived from GPS speed */
export type MovementState = 'stationary' | 'walking' | 'driving' | 'unknown';

/**
 * Classify a raw GPS speed (m/s) into a human-readable movement state.
 * Thresholds:
 *   < 0.5 m/s  → stationary
 *   < 8.0 m/s  → walking / cycling (up to ~28 km/h)
 *   ≥ 8.0 m/s  → driving
 *   null/undef → unknown (desktop/WiFi device, no speed available)
 */
export function classifySpeed(speedMs: number | null | undefined): MovementState {
  if (speedMs === null || speedMs === undefined) return 'unknown';
  if (speedMs < 0.5) return 'stationary';
  if (speedMs < 8.0) return 'walking';
  return 'driving';
}

const STORAGE_KEY = 'ace_payroll_travel_session';
const OFFLINE_QUEUE_KEY = 'ace_payroll_travel_offline_queue';

/** A single breadcrumb that could not be sent due to network unavailability. */
interface OfflineQueuedBreadcrumb {
  tenant_id: string;
  employee_id: string;
  start_timestamp_id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed_ms: number | null;
  cumulative_distance_meters: number;
  queued_at: number; // Date.now() when it was queued
}

// --- Offline Queue helpers ---
function loadOfflineQueue(): OfflineQueuedBreadcrumb[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue: OfflineQueuedBreadcrumb[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage full — silently discard oldest entry to make room
    const trimmed = queue.slice(-50);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(trimmed));
  }
}

function pushToOfflineQueue(breadcrumb: OfflineQueuedBreadcrumb): void {
  const queue = loadOfflineQueue();
  queue.push(breadcrumb);
  saveOfflineQueue(queue);
  console.warn(`[TravelTracking] Network unavailable — breadcrumb queued offline. Queue size: ${queue.length}`);
}

/**
 * Flush all offline-queued breadcrumbs to Supabase.
 * Called automatically when the browser reconnects (window 'online' event).
 * Safe to call at any time — exits immediately if the queue is empty.
 */
export async function flushOfflineQueue(): Promise<void> {
  const queue = loadOfflineQueue();
  if (queue.length === 0) return;

  console.log(`[TravelTracking] Flushing ${queue.length} offline-queued breadcrumbs...`);

  // Attempt bulk insert (one DB round-trip instead of N)
  const { error } = await supabase
    .from('attendance_travel_logs')
    .insert(queue.map(({ queued_at: _q, ...rest }) => rest));

  if (error) {
    console.error('[TravelTracking] Offline queue flush failed — will retry on next reconnect:', error.message);
  } else {
    console.log(`[TravelTracking] Offline queue flushed successfully (${queue.length} breadcrumbs).`);
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  }
}

// Auto-flush the queue as soon as the browser regains internet connectivity
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[TravelTracking] Network restored — attempting offline queue flush.');
    flushOfflineQueue();
  });
}

// --- Internal state (module-scoped, survives re-renders) ---
let watchId: number | null = null;
let activeSession: TravelSession | null = null;
let lastStoredLat: number | null = null;
let lastStoredLng: number | null = null;
let lastStoredTime: number = 0;
let cumulativeDistance: number = 0;
let sessionStartTime: number = 0;
let activeTimeThresholdMs: number = DEFAULT_TIME_THRESHOLD_MS;
let activeDistThresholdM: number = DEFAULT_DIST_THRESHOLD_M;

function saveState() {
  if (!activeSession) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  const state = {
    activeSession,
    cumulativeDistance,
    sessionStartTime,
    activeTimeThresholdMs,
    activeDistThresholdM,
    lastStoredTime,
    lastStoredLat,
    lastStoredLng,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Internal callbacks — use register/unregister from outside the module
let _distanceCallback: ((meters: number) => void) | null = null;
let _movementCallback: ((state: MovementState) => void) | null = null;

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
 * Register a UI callback to receive live movement state updates.
 * Fires on every accepted GPS fix with the current MovementState.
 */
export function registerMovementCallback(cb: (state: MovementState) => void): void {
  _movementCallback = cb;
}

/**
 * Unregister the live movement state callback.
 */
export function unregisterMovementCallback(): void {
  _movementCallback = null;
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
  sessionStartTime = session.startTime;
  
  // Use configured thresholds or fallback to defaults
  activeTimeThresholdMs = session.intervalMins !== undefined ? session.intervalMins * 60 * 1000 : DEFAULT_TIME_THRESHOLD_MS;
  activeDistThresholdM = session.thresholdMeters !== undefined ? session.thresholdMeters : DEFAULT_DIST_THRESHOLD_M;

  lastStoredTime = Date.now();
  lastStoredLat = null;
  lastStoredLng = null;
  
  saveState();

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
export async function stopTravelTracking(
  writeSummary: boolean = true,
  finalLocation?: { latitude: number; longitude: number }
): Promise<TravelSummary | null> {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  if (!activeSession || !writeSummary) {
    activeSession = null;
    return null;
  }

  // Insert final breadcrumb if provided
  if (finalLocation) {
    let distanceMoved = 0;
    if (lastStoredLat !== null && lastStoredLng !== null) {
      distanceMoved = calculateDistance(lastStoredLat, lastStoredLng, finalLocation.latitude, finalLocation.longitude);
    }
    cumulativeDistance += distanceMoved;

    const finalPayload: OfflineQueuedBreadcrumb = {
      tenant_id: activeSession.tenantId,
      employee_id: activeSession.employeeId,
      start_timestamp_id: activeSession.timestampId,
      latitude: finalLocation.latitude,
      longitude: finalLocation.longitude,
      accuracy: 10,
      speed_ms: null,
      cumulative_distance_meters: Math.round(cumulativeDistance),
      queued_at: Date.now(),
    };

    if (!navigator.onLine) {
      pushToOfflineQueue(finalPayload);
    } else {
      const { queued_at: _q, ...insertPayload } = finalPayload;
      const { error: finalErr } = await supabase
        .from('attendance_travel_logs')
        .insert(insertPayload);
      if (finalErr) {
        console.error('[TravelTracking] Final breadcrumb insert failed, queuing:', finalErr.message);
        pushToOfflineQueue(finalPayload);
      }
    }
  }

  const durationSeconds = Math.round((Date.now() - sessionStartTime) / 1000);
  
  // --- Distance Source Priority Ladder ---
  // 1. Roads API (snapToRoads + Routes API) — highest accuracy, follows actual road geometry
  // 2. Distance Matrix API                  — origin/dest road distance only
  // 3. Haversine sum (default)              — straight-line fallback
  let finalDistanceMeters = Math.round(cumulativeDistance);
  let plannedDistanceMeters: number | undefined;
  let roadsApiWarnings: string[] | undefined;

  try {
    const settings = useSettingsStore.getState().companySettings;

    // ── Priority 1: Roads API (snapToRoads + computeRoutes) ────────────────
    if (settings?.google_maps_enabled && settings?.google_maps_api_key && settings?.enable_roads_api) {
      const logs = await getTravelLogs(activeSession.timestampId);

      if (logs.length >= 2) {
        const rawPoints = logs.map(l => ({
          lat: l.latitude,
          lng: l.longitude,
          timestamp: Date.parse(l.recorded_at),
        }));

        console.log(`[TravelTracking] Running Roads API snap-to-roads on ${rawPoints.length} breadcrumbs…`);
        const result = await computeTravelDistance(rawPoints, settings.google_maps_api_key, {
          includeRoutesApi: true,
        });

        console.log(
          `[TravelTracking] Roads API → actual: ${result.actualDistanceMeters}m | planned: ${result.plannedDistanceMeters}m | Haversine was: ${finalDistanceMeters}m`
        );
        if (result.warnings.length > 0) {
          console.warn('[TravelTracking] Roads API warnings:', result.warnings);
        }

        finalDistanceMeters = result.actualDistanceMeters;
        plannedDistanceMeters = result.plannedDistanceMeters;
        roadsApiWarnings = result.warnings.length > 0 ? result.warnings : undefined;
      }

    // ── Priority 2: Distance Matrix API ────────────────────────────────────
    } else if (settings?.google_maps_enabled && settings?.google_maps_api_key && settings?.enable_distance_matrix_api) {
      const logs = await getTravelLogs(activeSession.timestampId);

      if (logs.length >= 2) {
        const origin = `${logs[0].latitude},${logs[0].longitude}`;
        const destination = `${logs[logs.length - 1].latitude},${logs[logs.length - 1].longitude}`;

        console.log(`[TravelTracking] Requesting road distance from Distance Matrix API…`);
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&key=${settings.google_maps_api_key}`
        );
        const data = await res.json();

        if (data.status === 'OK' && data.rows?.[0]?.elements?.[0]?.status === 'OK') {
          const exactRoadDistance = data.rows[0].elements[0].distance.value;
          console.log(`[TravelTracking] Distance Matrix → ${exactRoadDistance}m (Haversine was ${finalDistanceMeters}m).`);
          finalDistanceMeters = exactRoadDistance;
        } else {
          console.warn(`[TravelTracking] Distance Matrix API non-OK status:`, data.status, data.rows?.[0]?.elements?.[0]?.status);
        }
      }
    }
    // ── Priority 3: Haversine (already the default, nothing to do) ──────────
  } catch (err) {
    console.error(`[TravelTracking] Distance calculation error, falling back to Haversine:`, err);
  }

  const summary: TravelSummary = {
    totalDistanceMeters: finalDistanceMeters,
    totalDurationSeconds: durationSeconds,
    breadcrumbCount: 0, // informational only
    plannedDistanceMeters,
    roadsApiWarnings,
  };

  // Write the final summary back to the attendance_timestamp row
  const updatePayload: Record<string, unknown> = {
    travel_distance_meters: summary.totalDistanceMeters,
    travel_duration_seconds: summary.totalDurationSeconds,
  };

  // Persist planned distance + warnings when Roads API was used
  if (summary.plannedDistanceMeters !== undefined) {
    updatePayload.planned_distance_meters = summary.plannedDistanceMeters;
  }
  if (summary.roadsApiWarnings && summary.roadsApiWarnings.length > 0) {
    updatePayload.roads_api_warnings = summary.roadsApiWarnings;
  }

  const { error } = await supabase
    .from('attendance_timestamp')
    .update(updatePayload)
    .eq('id', activeSession.timestampId)
    .eq('tenant_id', activeSession.tenantId);

  if (error) {
    console.error('[TravelTracking] Failed to write summary:', error.message);
  } else {
    console.log(`[TravelTracking] Summary written — ${summary.totalDistanceMeters}m in ${durationSeconds}s`);
  }

  activeSession = null;
  localStorage.removeItem(STORAGE_KEY);
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
    .select('id, latitude, longitude, cumulative_distance_meters, recorded_at, speed_ms')
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
    speed_ms: row.speed_ms !== null && row.speed_ms !== undefined ? Number(row.speed_ms) : null,
  }));
}

/**
 * Get the current accumulated distance in meters.
 */
export function getCumulativeDistance(): number {
  return cumulativeDistance;
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

  const { latitude, longitude, accuracy, speed } = position.coords;
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

  // --- Tracking Logic ---
  // We store a new breadcrumb if EITHER the time threshold OR distance threshold is met.
  // This ensures we get high-resolution tracks when moving fast, but still get regular check-ins when stationary.
  const isTimeThresholdMet = timeSinceLast >= activeTimeThresholdMs;
  const isDistThresholdMet = distanceMoved >= activeDistThresholdM;

  let shouldStore = false;

  if (lastStoredLat === null) {
    // Always store the very first fix
    shouldStore = true;
  } else if (isTimeThresholdMet || isDistThresholdMet) {
    shouldStore = true;
  }

  // Always broadcast current movement state to UI (even if we won't store the fix)
  let speedMs: number | null = (speed !== null && speed !== undefined) ? speed : null;
  
  // Fallback to calculated speed if device reports 0 or null, but only if we have a previous point
  if ((speedMs === null || speedMs === 0) && lastStoredLat !== null && timeSinceLast > 0) {
    speedMs = distanceMoved / (timeSinceLast / 1000);
  }

  const currentState = classifySpeed(speedMs);
  if (_movementCallback) {
    _movementCallback(currentState);
  }

  if (!shouldStore) return;

  // Update running totals
  cumulativeDistance += distanceMoved;

  // Notify UI for live distance badge update
  if (_distanceCallback) {
    _distanceCallback(cumulativeDistance);
  }

  // Update last stored state
  lastStoredLat = latitude;
  lastStoredLng = longitude;
  lastStoredTime = now;

  saveState();

  // --- Insert breadcrumb (with offline queue fallback) ---
  const breadcrumbPayload: OfflineQueuedBreadcrumb = {
    tenant_id: activeSession.tenantId,
    employee_id: activeSession.employeeId,
    start_timestamp_id: activeSession.timestampId,
    latitude,
    longitude,
    accuracy,
    speed_ms: speedMs,
    cumulative_distance_meters: Math.round(cumulativeDistance),
    queued_at: Date.now(),
  };

  // If offline, queue it and return. It will be flushed when connectivity returns.
  if (!navigator.onLine) {
    pushToOfflineQueue(breadcrumbPayload);
    return;
  }

  const { queued_at: _q, ...insertPayload } = breadcrumbPayload;
  const { error } = await supabase
    .from('attendance_travel_logs')
    .insert(insertPayload);

  if (error) {
    // Network present but insert failed (e.g. transient server error) — queue it.
    console.error('[TravelTracking] Insert failed, adding to offline queue:', error.message);
    pushToOfflineQueue(breadcrumbPayload);
  } else {
    const speedLabel = speedMs !== null ? `${(speedMs * 3.6).toFixed(1)} km/h` : 'speed unknown';
    console.log(`[TravelTracking] Breadcrumb stored — cumulative: ${cumulativeDistance.toFixed(0)}m | ${speedLabel} (${currentState})`);
  }
}

// Auto-resume if active session exists in localStorage
if (typeof window !== 'undefined') {
  const savedStr = localStorage.getItem(STORAGE_KEY);
  if (savedStr) {
    try {
      const state = JSON.parse(savedStr);
      if (state.activeSession) {
        activeSession = state.activeSession;
        cumulativeDistance = state.cumulativeDistance || 0;
        sessionStartTime = state.sessionStartTime || Date.now();
        activeTimeThresholdMs = state.activeTimeThresholdMs || DEFAULT_TIME_THRESHOLD_MS;
        activeDistThresholdM = state.activeDistThresholdM || DEFAULT_DIST_THRESHOLD_M;
        lastStoredTime = state.lastStoredTime || Date.now();
        lastStoredLat = state.lastStoredLat;
        lastStoredLng = state.lastStoredLng;

        console.log('[TravelTracking] Resuming saved travel session...');
        
        if (navigator.geolocation) {
          watchId = navigator.geolocation.watchPosition(
            handlePositionUpdate,
            (err) => {
              console.warn('[TravelTracking] GPS error on resume:', err.message);
            },
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0,
            }
          );
        }
      }
    } catch (e) {
      console.error('[TravelTracking] Failed to parse saved session', e);
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}
