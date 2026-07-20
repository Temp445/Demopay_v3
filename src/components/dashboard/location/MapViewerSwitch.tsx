import { useLocationSettingsStore } from '../../../stores/locationSettingsStore';
import LocationMapViewer from './LocationMapViewer';
import GoogleMapsMapViewer from './GoogleMapsMapViewer';

interface MapViewerSwitchProps {
  latitude: number;
  longitude: number;
  locationName: string;
  address?: string;
  showNavigation?: boolean;
  currentLat?: number;
  currentLng?: number;
  height?: string;
  radius?: number;
  journeyLogs?: any[]; // <-- Added this line to accept the logs
}

export default function MapViewerSwitch(props: MapViewerSwitchProps) {
  const { settings } = useLocationSettingsStore();

  if (settings.google_maps_enabled && settings.google_maps_api_key) {
    return <GoogleMapsMapViewer apiKey={settings.google_maps_api_key} {...props} />;
  }

  return <LocationMapViewer {...props} />;
}