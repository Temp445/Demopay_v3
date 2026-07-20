import { useLocationSettingsStore } from '../../../stores/locationSettingsStore';
import LiveTrackingDashboard from './LiveTrackingDashboard';
import GoogleMapsLiveTracking from './GoogleMapsLiveTracking';

export default function LiveTrackingSwitch() {
  const { settings } = useLocationSettingsStore();

  if (settings.google_maps_enabled && settings.google_maps_api_key) {
    return <GoogleMapsLiveTracking apiKey={settings.google_maps_api_key} />;
  }

  return <LiveTrackingDashboard />;
}
