/**
 * GoogleMapsContext.tsx
 *
 * Provides a single shared Google Maps JS API loader for the entire app.
 * Prevents the "@react-google-maps/api" crash caused by calling
 * useJsApiLoader multiple times with different API keys across components.
 *
 * Includes the "marker" library so AdvancedMarkerElement is available.
 */
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

const LIBRARIES: ("places" | "geocoding" | "marker" | "routes" | "geometry")[] = ["places", "geocoding", "marker", "routes", "geometry"];

interface GoogleMapsContextValue {
  isLoaded: boolean;
}

const GoogleMapsContext = createContext<GoogleMapsContextValue>({ isLoaded: false });

interface GoogleMapsLoaderProps {
  apiKey: string;
  children: ReactNode;
}

// Inner component — only rendered after we have a stable non-empty API key.
// This ensures useJsApiLoader is only ever called once with the same key.
function GoogleMapsLoader({ apiKey, children }: GoogleMapsLoaderProps) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries: LIBRARIES,
  });

  return (
    <GoogleMapsContext.Provider value={{ isLoaded }}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

interface GoogleMapsProviderProps {
  apiKey: string;
  children: ReactNode;
}

// Outer provider — holds onto the FIRST non-empty apiKey it receives and
// never changes it, preventing the "Loader must not be called again" error.
export function GoogleMapsProvider({ apiKey, children }: GoogleMapsProviderProps) {
  const [stableKey, setStableKey] = useState<string | null>(null);

  useEffect(() => {
    if (apiKey && !stableKey) {
      setStableKey(apiKey);
    }
  }, [apiKey, stableKey]);

  if (!stableKey) {
    // Google Maps not configured yet — render children with isLoaded: false
    return (
      <GoogleMapsContext.Provider value={{ isLoaded: false }}>
        {children}
      </GoogleMapsContext.Provider>
    );
  }

  return <GoogleMapsLoader apiKey={stableKey}>{children}</GoogleMapsLoader>;
}

export function useGoogleMaps(): GoogleMapsContextValue {
  return useContext(GoogleMapsContext);
}
