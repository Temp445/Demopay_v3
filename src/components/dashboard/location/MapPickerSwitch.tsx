import { useLocationSettingsStore } from '../../../stores/locationSettingsStore';
import LocationMapPicker from './LocationMapPicker';
import GoogleMapsMapPicker from './GoogleMapsMapPicker';

interface MapPickerSwitchProps {
  initialLat?: number;
  initialLng?: number;
  onLocationSelect: (data: {
    latitude: number;
    longitude: number;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
    formatted_address?: string;
  }) => void;
  showSearch?: boolean;
  height?: string;
}

export default function MapPickerSwitch(props: MapPickerSwitchProps) {
  const { settings } = useLocationSettingsStore();

  if (settings.google_maps_enabled && settings.google_maps_api_key) {
    return <GoogleMapsMapPicker apiKey={settings.google_maps_api_key} {...props} />;
  }

  return <LocationMapPicker {...props} />;
}
