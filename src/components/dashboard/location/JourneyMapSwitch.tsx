import { lazy, Suspense } from 'react';
import { useLocationSettingsStore } from '../../../stores/locationSettingsStore';
import type { JourneyPoint } from './JourneyGoogleMap';
import type { WorkSitePin, PathSegment } from './JourneyLeafletMap';

const JourneyLeafletMap = lazy(() => import('./JourneyLeafletMap'));
const JourneyGoogleMap = lazy(() => import('./JourneyGoogleMap'));

interface JourneyMapSwitchProps {
  points: JourneyPoint[];
  workLat: number;
  workLng: number;
  workName: string;
  radiusMeters?: number;
  height?: string;
  // Multi-location support (optional)
  workSites?: WorkSitePin[];
  segments?: PathSegment[];
}

export default function JourneyMapSwitch(props: JourneyMapSwitchProps) {
  const { settings } = useLocationSettingsStore();

  const fallback = (
    <div className="flex items-center justify-center bg-slate-100 rounded-xl" style={{ height: props.height || '400px' }}>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
    </div>
  );

  if (settings.google_maps_enabled && settings.google_maps_api_key) {
    return (
      <Suspense fallback={fallback}>
        <JourneyGoogleMap apiKey={settings.google_maps_api_key} {...props} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={fallback}>
      <JourneyLeafletMap {...props} />
    </Suspense>
  );
}
