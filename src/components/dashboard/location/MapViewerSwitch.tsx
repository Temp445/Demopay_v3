import { useSettingsStore } from '../../../stores/settingsStore';
import LocationMapViewer from './LocationMapViewer';
import GoogleMapsMapViewer from './GoogleMapsMapViewer';

interface MapViewerSwitchProps {
  latitude: number;
  longitude: number;
  locationName: string;
  address?: string;
  showNavigation?: boolean;
  autoFocusPath?: boolean;
  currentLat?: number;
  currentLng?: number;
  height?: string;
  radius?: number;
  journeyLogs?: any[]; // <-- Added this line to accept the logs
}

export default function MapViewerSwitch(props: MapViewerSwitchProps) {
  const { companySettings } = useSettingsStore();

  if (companySettings?.google_maps_enabled && companySettings?.google_maps_api_key) {
    return <GoogleMapsMapViewer apiKey={companySettings.google_maps_api_key} {...props} />;
  }

  return <LocationMapViewer {...props} />;
}