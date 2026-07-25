/**
 * AdvancedMarker.tsx
 *
 * A React wrapper for google.maps.marker.AdvancedMarkerElement, which is the
 * replacement for the deprecated google.maps.Marker (MarkerF).
 *
 * AdvancedMarkerElement requires a mapId on the GoogleMap instance.
 * This component handles its own DOM lifecycle using useEffect + refs.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

interface AdvancedMarkerProps {
  map: google.maps.Map | null;
  position: google.maps.LatLngLiteral;
  title?: string;
  onClick?: () => void;
  onDragEnd?: (e: google.maps.MapMouseEvent) => void;
  draggable?: boolean;
  label?: string; // Text glyph for default pin
  /** SVG path symbol (for small dot markers etc.) */
  symbol?: {
    path: string | number;
    fillColor: string;
    fillOpacity: number;
    strokeColor: string;
    strokeWeight: number;
    scale: number;
  };
  /** URL-based icon */
  iconUrl?: string;
  iconSize?: [number, number];
  iconAnchor?: [number, number];
  zIndex?: number;
}

export default function AdvancedMarker({
  map,
  position,
  title,
  onClick,
  onDragEnd,
  draggable,
  label,
  symbol,
  iconUrl,
  iconSize,
  iconAnchor,
  zIndex,
}: AdvancedMarkerProps) {
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  useEffect(() => {
    if (!map) return;
    if (!("AdvancedMarkerElement" in google.maps.marker)) return;

    let pinElement: google.maps.marker.PinElement | undefined;
    let contentEl: HTMLElement | undefined;

    if (iconUrl) {
      const img = document.createElement("img");
      img.src = iconUrl;
      if (iconSize) {
        img.style.width = `${iconSize[0]}px`;
        img.style.height = `${iconSize[1]}px`;
      }
      if (iconAnchor) {
        img.style.marginLeft = `-${iconAnchor[0]}px`;
        img.style.marginTop = `-${iconAnchor[1]}px`;
      }
      contentEl = img;
    } else if (symbol) {
      // For circle/symbol markers render a small div
      const size = (symbol.scale || 5) * 2;
      const div = document.createElement("div");
      div.style.width = `${size}px`;
      div.style.height = `${size}px`;
      div.style.borderRadius = "50%";
      div.style.background = symbol.fillColor;
      div.style.border = `${symbol.strokeWeight}px solid ${symbol.strokeColor}`;
      div.style.opacity = String(symbol.fillOpacity);
      contentEl = div;
    } else {
      // Default pin
      pinElement = new google.maps.marker.PinElement();
      if (label) {
        pinElement.glyph = label;
      }
      contentEl = pinElement.element;
    }

    const marker = new google.maps.marker.AdvancedMarkerElement({
      map,
      position,
      title,
      content: contentEl,
      gmpDraggable: draggable,
      zIndex,
    });

    if (onClick) {
      marker.addListener("click", onClick);
    }
    if (onDragEnd && draggable) {
      marker.addListener("dragend", onDragEnd);
    }

    markerRef.current = marker;

    return () => {
      marker.map = null;
      markerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, label]);

  // Update position when it changes
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.position = position;
    }
  }, [position.lat, position.lng]);

  return null;
}
