import { useSettingsStore } from '../../../stores/settingsStore';
import LiveTrackingDashboard from './LiveTrackingDashboard';
import GoogleMapsLiveTracking from './GoogleMapsLiveTracking';

export default function LiveTrackingSwitch() {
  const { companySettings } = useSettingsStore();

  if (companySettings?.google_maps_enabled && companySettings?.google_maps_api_key) {
    return <GoogleMapsLiveTracking apiKey={companySettings.google_maps_api_key} />;
  }

  return <LiveTrackingDashboard />;
}
