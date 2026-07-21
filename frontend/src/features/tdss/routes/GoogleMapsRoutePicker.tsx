import { useEffect, useRef, useState } from 'react';
import { computeRoute, loadMapsLibrary, loadMarkerLibrary, loadPlacesLibrary } from './googleMapsClient';

export interface RouteComputationResult {
  origin: string;
  destination: string;
  distance_km: number;
  estimated_duration_minutes: number;
}

// mapId: a styled Map ID isn't needed for this scope (no custom styling
// requirement) — Google's public DEMO_MAP_ID is documented for exactly
// this case and works without any extra Cloud Console setup, unless the
// org has already provisioned its own via VITE_GOOGLE_MAPS_MAP_ID.
const MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || 'DEMO_MAP_ID';

export default function GoogleMapsRoutePicker({
  initialOrigin,
  initialDestination,
  onResult,
}: {
  initialOrigin?: string;
  initialDestination?: string;
  onResult: (result: RouteComputationResult) => void;
}) {
  const originContainerRef = useRef<HTMLDivElement>(null);
  const destinationContainerRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  const originLocationRef = useRef<google.maps.LatLngLiteral | null>(null);
  const destinationLocationRef = useRef<google.maps.LatLngLiteral | null>(null);
  const originTextRef = useRef<string>(initialOrigin ?? '');
  const destinationTextRef = useRef<string>(initialDestination ?? '');

  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<RouteComputationResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        const [{ PlaceAutocompleteElement }, { Map }] = await Promise.all([loadPlacesLibrary(), loadMapsLibrary()]);
        await loadMarkerLibrary();
        if (cancelled) return;

        const map = new Map(mapContainerRef.current!, {
          center: { lat: 13.7563, lng: 100.5018 }, // Bangkok — neutral default center
          zoom: 6,
          mapId: MAP_ID,
        });
        mapRef.current = map;

        const originEl = new PlaceAutocompleteElement({ includedRegionCodes: ['th'] });
        originEl.placeholder = 'ค้นหาต้นทาง...';
        originContainerRef.current!.appendChild(originEl);
        originEl.addEventListener('gmp-select', async (e) => {
          const place = (e as google.maps.places.PlacePredictionSelectEvent).placePrediction.toPlace();
          await place.fetchFields({ fields: ['location', 'formattedAddress'] });
          if (!place.location) return;
          originLocationRef.current = { lat: place.location.lat(), lng: place.location.lng() };
          originTextRef.current = place.formattedAddress ?? originTextRef.current;
          await maybeComputeRoute();
        });

        const destinationEl = new PlaceAutocompleteElement({ includedRegionCodes: ['th'] });
        destinationEl.placeholder = 'ค้นหาปลายทาง...';
        destinationContainerRef.current!.appendChild(destinationEl);
        destinationEl.addEventListener('gmp-select', async (e) => {
          const place = (e as google.maps.places.PlacePredictionSelectEvent).placePrediction.toPlace();
          await place.fetchFields({ fields: ['location', 'formattedAddress'] });
          if (!place.location) return;
          destinationLocationRef.current = { lat: place.location.lat(), lng: place.location.lng() };
          destinationTextRef.current = place.formattedAddress ?? destinationTextRef.current;
          await maybeComputeRoute();
        });

        setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage(err instanceof Error ? err.message : 'โหลด Google Maps ไม่สำเร็จ');
        }
      }
    }

    async function maybeComputeRoute() {
      const origin = originLocationRef.current;
      const destination = destinationLocationRef.current;
      if (!origin || !destination) return;
      try {
        const computed = await computeRoute(origin, destination);
        drawRoute(origin, destination, computed.path);
        const value: RouteComputationResult = {
          origin: originTextRef.current,
          destination: destinationTextRef.current,
          distance_km: Math.round(computed.distanceKm * 100) / 100,
          estimated_duration_minutes: Math.round(computed.durationMinutes),
        };
        setResult(value);
        onResult(value);
      } catch (err) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'คำนวณเส้นทางไม่สำเร็จ');
      }
    }

    function drawRoute(origin: google.maps.LatLngLiteral, destination: google.maps.LatLngLiteral, path: google.maps.LatLngAltitude[]) {
      const map = mapRef.current;
      if (!map) return;

      polylineRef.current?.setMap(null);
      markersRef.current.forEach((m) => (m.map = null));
      markersRef.current = [];

      const google_ = window.google;
      polylineRef.current = new google_.maps.Polyline({
        path: path.map((p) => ({ lat: p.lat, lng: p.lng })),
        strokeColor: '#D71920',
        strokeWeight: 4,
        map,
      });

      const originMarker = new google_.maps.marker.AdvancedMarkerElement({ position: origin, map, title: 'ต้นทาง' });
      const destinationMarker = new google_.maps.marker.AdvancedMarkerElement({ position: destination, map, title: 'ปลายทาง' });
      markersRef.current = [originMarker, destinationMarker];

      const bounds = new google_.maps.LatLngBounds();
      bounds.extend(origin);
      bounds.extend(destination);
      map.fitBounds(bounds, 48);
    }

    setStatus('loading');
    void setup();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text-muted)', marginBottom: 6 }}>ต้นทาง</label>
          <div ref={originContainerRef} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text-muted)', marginBottom: 6 }}>ปลายทาง</label>
          <div ref={destinationContainerRef} />
        </div>
      </div>

      <div ref={mapContainerRef} style={{ width: '100%', height: 260, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--c-border)', marginBottom: 10 }} />

      {status === 'loading' && <div style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>กำลังโหลด Google Maps...</div>}
      {status === 'error' && (
        <div style={{ fontSize: 12, color: 'var(--c-accent)', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>{errorMessage}</div>
      )}
      {result && (
        <div style={{ display: 'flex', gap: 20, fontSize: 12.5, background: '#f6f7f8', borderRadius: 8, padding: '10px 14px' }}>
          <div>
            ระยะทาง: <strong>{result.distance_km.toLocaleString()} กม.</strong>
          </div>
          <div>
            เวลาเดินทางปกติ: <strong>{result.estimated_duration_minutes.toLocaleString()} นาที</strong>
          </div>
        </div>
      )}
    </div>
  );
}
