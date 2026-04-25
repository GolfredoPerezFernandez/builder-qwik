import {
  component$,
  noSerialize,
  useSignal,
  useStyles$,
  useVisibleTask$,
} from "@builder.io/qwik";
import type { Map, Marker } from "leaflet";
import type { MapProps } from "../../models/map";
import leafletStyles from 'leaflet/dist/leaflet.css?inline';

export const LeafletMap = component$<MapProps>(({ location }: MapProps) => {
  useStyles$(`
    ${leafletStyles}

    .leaflet-map-root {
      width: 100%;
      height: 100%;
      min-height: 16rem;
      position: relative;
      overflow: hidden;
    }
  `);

  const mapElementRef = useSignal<HTMLDivElement>();
  const mapInstanceRef = useSignal<any>(null);
  const markerInstanceRef = useSignal<any>(null);

  useVisibleTask$(async ({ track }) => {
    track(() => location.value.point[0]);
    track(() => location.value.point[1]);
    track(() => location.value.zoom);
    track(() => location.value.marker);

    const mapElement = mapElementRef.value;
    if (!mapElement) return;

    const L = await import("leaflet");
    const { tileLayer, marker } = L;
    const { getBoundaryBox } = await import("../../helpers/boundary-box");

    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });

    const { value: locationData } = location;
    const latitude = Number(locationData.point?.[0]);
    const longitude = Number(locationData.point?.[1]);
    const hasValidPoint = Number.isFinite(latitude)
      && Number.isFinite(longitude)
      && Math.abs(latitude) <= 90
      && Math.abs(longitude) <= 180
      && !(latitude === 0 && longitude === 0);

    if (!hasValidPoint) return;

    const centerPosition: [number, number] = [latitude, longitude];
    const targetZoom = Math.min(18, Math.max(13, Number(locationData.zoom) || 15));

    let map = mapInstanceRef.value as Map | null;

    if (!map) {
      map = L.map(mapElement, {
        zoomControl: true,
        attributionControl: true,
      }).setView(centerPosition, targetZoom);

      tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      mapInstanceRef.value = noSerialize(map);

      const resizeObserver = new ResizeObserver(() => {
        map?.invalidateSize();
      });
      resizeObserver.observe(mapElement);

      setTimeout(() => {
        map?.invalidateSize();
      }, 50);
    } else {
      map.setView(centerPosition, targetZoom, { animate: false });
      map.invalidateSize();
    }

    locationData.boundaryBox = getBoundaryBox(map);

    const existingMarker = markerInstanceRef.value as Marker | null;
    if (existingMarker) {
      existingMarker.remove();
      markerInstanceRef.value = null;
    }

    if (locationData.marker) {
      const newMarker = marker(centerPosition).addTo(map);
      markerInstanceRef.value = noSerialize(newMarker);
    }
  });

  return <div ref={mapElementRef} class="leaflet-map-root" />;
});
