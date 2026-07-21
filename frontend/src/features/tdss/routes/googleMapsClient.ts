// Thin wrapper around the modern Google Maps JS API surfaces this feature
// uses — no DirectionsService (deprecated), no legacy Autocomplete widget.
// Scope is deliberately narrow: origin/destination selection, a route
// distance + duration lookup, and drawing that one route on a map. No live
// traffic, waypoint optimization, GPS, or fleet features.
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

let optionsConfigured = false;

function ensureOptionsConfigured(): void {
  if (optionsConfigured) return;
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!apiKey) throw new Error('VITE_GOOGLE_MAPS_API_KEY is not set');
  setOptions({ key: apiKey, v: 'weekly' });
  optionsConfigured = true;
}

export function isGoogleMapsConfigured(): boolean {
  return Boolean((import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim());
}

export async function loadPlacesLibrary(): Promise<google.maps.PlacesLibrary> {
  ensureOptionsConfigured();
  return importLibrary('places');
}

export async function loadRoutesLibrary(): Promise<google.maps.RoutesLibrary> {
  ensureOptionsConfigured();
  return importLibrary('routes');
}

export async function loadMapsLibrary(): Promise<google.maps.MapsLibrary> {
  ensureOptionsConfigured();
  return importLibrary('maps');
}

export async function loadMarkerLibrary(): Promise<google.maps.MarkerLibrary> {
  ensureOptionsConfigured();
  return importLibrary('marker');
}

export interface ComputedRoute {
  distanceKm: number;
  durationMinutes: number;
  path: google.maps.LatLngAltitude[];
}

// travelMode DRIVING + routingPreference TRAFFIC_UNAWARE is explicit: the
// result must NOT depend on live/predicted traffic (out of scope per spec).
export async function computeRoute(
  origin: google.maps.LatLngLiteral,
  destination: google.maps.LatLngLiteral,
): Promise<ComputedRoute> {
  const { Route } = await loadRoutesLibrary();
  const result = await Route.computeRoutes({
    origin,
    destination,
    travelMode: 'DRIVING',
    routingPreference: 'TRAFFIC_UNAWARE',
    fields: ['durationMillis', 'distanceMeters', 'path'],
  });
  const route = result.routes?.[0];
  if (!route || route.distanceMeters == null || route.durationMillis == null) {
    throw new Error('ไม่พบเส้นทางระหว่างต้นทางและปลายทางที่เลือก');
  }
  return {
    distanceKm: route.distanceMeters / 1000,
    durationMinutes: route.durationMillis / 60000,
    path: route.path ?? [],
  };
}
