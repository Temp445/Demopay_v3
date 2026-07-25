import { useRef, useCallback } from 'react';
import { GoogleMap, PolylineF, CircleF, InfoWindowF } from '@react-google-maps/api';
import AdvancedMarker from './AdvancedMarker';
import { useGoogleMaps } from '../../../contexts/GoogleMapsContext';
const MAP_ID = 'DEMO_MAP_ID';
import { MapPin, Navigation as NavigationIcon } from 'lucide-react';
import { useState } from 'react';

interface GoogleMapsMapViewerProps {
  apiKey: string;
  latitude: number;
  longitude: number;
  locationName: string;
  address?: string;
  showNavigation?: boolean;
  currentLat?: number;
  currentLng?: number;
  height?: string;
  radius?: number;
}

export default function GoogleMapsMapViewer({
  apiKey,
  latitude,
  longitude,
  locationName,
  address,
  showNavigation = false,
  currentLat,
  currentLng,
  height = '400px',
  radius,
}: GoogleMapsMapViewerProps) {
  const { isLoaded } = useGoogleMaps();

  const mapRef = useRef<google.maps.Map | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const center = { lat: latitude, lng: longitude };
  const currentPosition = showNavigation && currentLat && currentLng
    ? { lat: currentLat, lng: currentLng }
    : undefined;

  const onMapLoad = useCallback((mapInstance: google.maps.Map) => {
    mapRef.current = mapInstance;
    setMap(mapInstance);
    if (currentPosition) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(center);
      bounds.extend(currentPosition);
      mapInstance.fitBounds(bounds, 50);
    }
  }, [currentPosition]);

  const openInGoogleMaps = () => {
    if (showNavigation && currentLat && currentLng) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&origin=${currentLat},${currentLng}&destination=${latitude},${longitude}`,
        '_blank'
      );
    } else {
      window.open(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`, '_blank');
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-red-600" />
            {locationName}
          </h3>
          {address && <p className="text-sm text-gray-600 mt-1">{address}</p>}
          <p className="text-xs text-gray-500 mt-1">
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </p>
        </div>
        {/* <button
          onClick={openInGoogleMaps}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
        >
          <NavigationIcon className="h-4 w-4" />
          {showNavigation ? 'Get Directions' : 'Open in Maps'}
        </button> */}
      </div>

      <div className="border border-gray-300 rounded-lg overflow-hidden" style={{ height }}>
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={center}
          zoom={showNavigation && currentPosition ? 12 : 15}
          onLoad={onMapLoad}
          options={{
            mapId: MAP_ID,
            streetViewControl: false,
            fullscreenControl: true,
            mapTypeControl: true,
            mapTypeControlOptions: { position: google.maps.ControlPosition.TOP_LEFT },
          }}
        >
          <AdvancedMarker
            map={map}
            position={center}
            onClick={() => setShowInfo(true)}
            iconUrl="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png"
            iconSize={[25, 41]}
            iconAnchor={[12, 41]}
          />

          {showInfo && (
            <InfoWindowF position={center} onCloseClick={() => setShowInfo(false)}>
              <div className="text-sm">
                <div className="font-semibold mb-1">{locationName}</div>
                {address && <div className="text-gray-600 mb-1">{address}</div>}
                <div className="text-xs text-gray-500">
                  Destination: {latitude.toFixed(6)}, {longitude.toFixed(6)}
                </div>
              </div>
            </InfoWindowF>
          )}

          {radius && (
            <CircleF
              center={center}
              radius={radius}
              options={{
                strokeColor: '#3B82F6',
                fillColor: '#3B82F6',
                fillOpacity: 0.1,
                strokeWeight: 2,
              }}
            />
          )}

          {showNavigation && currentPosition && (
            <>
              <AdvancedMarker
                map={map}
                position={currentPosition}
                iconUrl="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png"
                iconSize={[25, 41]}
                iconAnchor={[12, 41]}
              />
              <PolylineF
                path={[currentPosition, center]}
                options={{
                  strokeColor: '#3B82F6',
                  strokeWeight: 3,
                  strokeOpacity: 0.7,
                  icons: [{
                    icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
                    offset: '0',
                    repeat: '15px',
                  }],
                }}
              />
            </>
          )}
        </GoogleMap>
      </div>

      {showNavigation && currentPosition && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <NavigationIcon className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-900">
              Route shown from your current location to the work site
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
