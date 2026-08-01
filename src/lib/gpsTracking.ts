import type { GPSCoordinates } from '../types/workLocation';
import { getPreciseDistance } from 'geolib';

export class GPSTrackingService {
  private watchId: number | null = null;
  private onPositionUpdate: ((position: GPSCoordinates) => void) | null = null;
  private onError: ((error: string) => void) | null = null;

  startTracking(
    onUpdate: (position: GPSCoordinates) => void,
    onError: (error: string) => void,
    options?: PositionOptions
  ): void {
    if (!navigator.geolocation) {
      onError('Geolocation is not supported by your browser');
      return;
    }

    this.onPositionUpdate = onUpdate;
    this.onError = onError;

    const defaultOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
      ...options,
    };

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const coords: GPSCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed_ms: position.coords.speed !== null ? position.coords.speed : null,
        };
        this.onPositionUpdate?.(coords);
      },
      (error) => {
        let errorMessage = 'Unknown error occurred';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied. Please enable location access.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out.';
            break;
        }
        this.onError?.(errorMessage);
      },
      defaultOptions
    );
  }

  stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
      this.onPositionUpdate = null;
      this.onError = null;
    }
  }

  async getCurrentPosition(): Promise<GPSCoordinates> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed_ms: position.coords.speed !== null ? position.coords.speed : null,
          });
        },
        (error) => {
          let errorMessage = 'Unable to get location';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location permission denied';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location unavailable';
              break;
            case error.TIMEOUT:
              errorMessage = 'Location request timed out';
              break;
          }
          reject(new Error(errorMessage));
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        }
      );
    });
  }

  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const distance = getPreciseDistance(
      { latitude: lat1, longitude: lon1 },
      { latitude: lat2, longitude: lon2 }
    );
    return Math.round(distance * 100) / 100;
  }

  isWithinRadius(
    currentLat: number,
    currentLon: number,
    targetLat: number,
    targetLon: number,
    radiusMeters: number
  ): boolean {
    const distance = this.calculateDistance(currentLat, currentLon, targetLat, targetLon);
    return distance <= radiusMeters;
  }

  async requestPermission(): Promise<PermissionState> {
    if (!navigator.permissions) {
      throw new Error('Permissions API not supported');
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      return result.state;
    } catch (error) {
      throw new Error('Failed to check location permission');
    }
  }

  getBatteryLevel(): Promise<number | null> {
    return new Promise((resolve) => {
      if ('getBattery' in navigator) {
        (navigator as any).getBattery().then((battery: any) => {
          resolve(Math.round(battery.level * 100));
        }).catch(() => {
          resolve(null);
        });
      } else {
        resolve(null);
      }
    });
  }
}

export const gpsTrackingService = new GPSTrackingService();
