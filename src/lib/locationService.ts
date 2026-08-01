import { getPreciseDistance } from 'geolib';

export interface BranchLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
}

export interface LocationValidationResult {
  latitude: number;
  longitude: number;
  nearestBranch: BranchLocation | null;
  distanceMeters: number | null;
  status: 'Office' | 'Outside Office';
}

/**
 * Calculates the exact distance between two points on the Earth's surface using Vincenty's formulae via geolib.
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return getPreciseDistance(
    { latitude: lat1, longitude: lon1 },
    { latitude: lat2, longitude: lon2 }
  );
}

/**
 * Gets the user's current geolocation via the browser API.
 */
export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'));
      return;
    }

    // Try high accuracy first
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => {
        console.warn('High accuracy geolocation failed, trying low accuracy...', err);
        // Fallback to low accuracy, longer timeout, and allow fully cached position
        navigator.geolocation.getCurrentPosition(
          resolve,
          (fallbackErr) => {
            console.error('Geolocation fallback also failed:', fallbackErr);
            reject(fallbackErr);
          },
          {
            enableHighAccuracy: false,
            timeout: 40000,
            maximumAge: Infinity, // Accept any cached location
          }
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 10000, // Allow slightly cached position (10s)
      }
    );
  });
}

/**
 * Retrieves the current location and determines if it is within any branch's radius.
 */
export async function validateLocationAgainstBranches(
  branches: BranchLocation[]
): Promise<LocationValidationResult> {
  try {
    const position = await getCurrentPosition();
    const currentLat = position.coords.latitude;
    const currentLng = position.coords.longitude;

    if (!branches || branches.length === 0) {
      return {
        latitude: currentLat,
        longitude: currentLng,
        nearestBranch: null,
        distanceMeters: null,
        status: 'Outside Office',
      };
    }

    let nearestBranch: BranchLocation | null = null;
    let shortestDistance = Infinity;

    // Find the nearest branch
    for (const branch of branches) {
      if (!branch.latitude || !branch.longitude) continue;
      
      const distance = calculateDistance(currentLat, currentLng, branch.latitude, branch.longitude);
      
      if (distance < shortestDistance) {
        shortestDistance = distance;
        nearestBranch = branch;
      }
    }

    // Determine if within radius of the nearest branch
    const isWithinRadius = nearestBranch && shortestDistance <= nearestBranch.radius;

    return {
      latitude: currentLat,
      longitude: currentLng,
      nearestBranch,
      distanceMeters: (shortestDistance !== Infinity && !isWithinRadius) ? shortestDistance : null,
      status: isWithinRadius ? 'Office' : 'Outside Office',
    };
  } catch (error) {
    // If geolocation fails, we re-throw so the UI can handle it (e.g. show permission error)
    throw error;
  }
}
