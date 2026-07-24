import { useSettingsStore } from '../../../stores/settingsStore';
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
  lat?: number;
  lng?: number;
  radius?: number;
}

export default function MapPickerSwitch(props: MapPickerSwitchProps) {
  const { companySettings } = useSettingsStore();

  if (companySettings?.google_maps_enabled && companySettings?.google_maps_api_key) {
    return <GoogleMapsMapPicker 
      apiKey={companySettings.google_maps_api_key} 
      {...props} 
      showSearch={props.showSearch !== false && !!companySettings.enable_places_api}
    />;
  }

  return <LocationMapPicker {...props} />;
}
