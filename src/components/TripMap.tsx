import React, { useEffect, useRef } from 'react';
import { Map as MapIcon, Star, Compass, UtensilsCrossed, Landmark, Leaf, RefreshCw } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Place } from '../types';

// Fix Leaflet default icon paths (broken by bundlers)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon   from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl:       markerIcon,
  shadowUrl:     markerShadow,
});

// ── Custom colored markers ──────────────────────────────────────────────────
function makeIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:30px;height:30px;border-radius:50% 50% 50% 0;
      background:${color};border:3px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,.35);
      transform:rotate(-45deg);
    "></div>`,
    iconSize:   [30, 30],
    iconAnchor: [15, 30],
    popupAnchor:[0, -32],
  });
}

const ICON_FOOD     = makeIcon('#f97316');
const ICON_MUSEUM   = makeIcon('#8b5cf6');
const ICON_NATURE   = makeIcon('#22c55e');
const ICON_MUST     = makeIcon('#eab308');
const ICON_DEFAULT  = makeIcon('#3b82f6');

const FOOD_TYPES = new Set(['מסעדה', 'קפה']);

function getIcon(p: Place) {
  if (p.must)                    return ICON_MUST;
  if (FOOD_TYPES.has(p.type))    return ICON_FOOD;
  if (p.type === 'מוזיאון')       return ICON_MUSEUM;
  if (p.type === 'פארק')          return ICON_NATURE;
  return ICON_DEFAULT;
}

// ── Legend item ─────────────────────────────────────────────────────────────
const LEGEND: { color: string; label: string; icon: React.ElementType }[] = [
  { color: '#eab308', label: 'Must',     icon: Star },
  { color: '#3b82f6', label: 'אטרקציה',  icon: Compass },
  { color: '#f97316', label: 'אוכל',     icon: UtensilsCrossed },
  { color: '#8b5cf6', label: 'מוזיאון',  icon: Landmark },
  { color: '#22c55e', label: 'טבע',      icon: Leaf },
];

interface Props {
  places: Place[];
  destination?: string;
}

export default function TripMap({ places, destination }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<L.Map | null>(null);

  const geoPlaces = places.filter(p => p.lat != null && p.lng != null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Default center: first place with coords, or destination fallback
    const first = geoPlaces[0];
    const center: L.LatLngExpression = first
      ? [first.lat!, first.lng!]
      : [50.06, 19.94]; // Krakow fallback

    const map = L.map(containerRef.current, {
      center,
      zoom: 13,
      zoomControl: true,
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const markers: L.Marker[] = [];

    geoPlaces.forEach(p => {
      const marker = L.marker([p.lat!, p.lng!], { icon: getIcon(p) }).addTo(map);
      const popup = L.popup({ maxWidth: 220 }).setContent(`
        <div style="font-family:inherit;direction:rtl;text-align:right">
          ${p.imageUrl ? `<img src="${p.imageUrl}" style="width:100%;height:90px;object-fit:cover;border-radius:6px;margin-bottom:8px;display:block" />` : ''}
          <strong style="font-size:14px">${p.nameHe}</strong>
          ${p.nameEn ? `<div style="font-size:12px;color:#666">${p.nameEn}</div>` : ''}
          ${p.type   ? `<div style="font-size:12px;color:#888;margin-top:4px">${p.type}${p.city ? ` · ${p.city}` : ''}</div>` : ''}
          ${p.address ? `<div style="font-size:11px;color:#999;margin-top:4px">${p.address}</div>` : ''}
        </div>
      `);
      marker.bindPopup(popup);
      markers.push(marker);
    });

    // Fit map to all markers
    if (markers.length > 1) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.15));
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers when places change (without re-creating map)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Remove all existing layers except tiles
    map.eachLayer(layer => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });
    const markers: L.Marker[] = [];
    geoPlaces.forEach(p => {
      const marker = L.marker([p.lat!, p.lng!], { icon: getIcon(p) }).addTo(map);
      marker.bindPopup(`
        <div style="font-family:inherit;direction:rtl;text-align:right">
          ${p.imageUrl ? `<img src="${p.imageUrl}" style="width:100%;height:90px;object-fit:cover;border-radius:6px;margin-bottom:8px;display:block" />` : ''}
          <strong style="font-size:14px">${p.nameHe}</strong>
          ${p.nameEn ? `<div style="font-size:12px;color:#666">${p.nameEn}</div>` : ''}
          ${p.type ? `<div style="font-size:12px;color:#888;margin-top:4px">${p.type}${p.city ? ` · ${p.city}` : ''}</div>` : ''}
        </div>
      `);
      markers.push(marker);
    });
    if (markers.length > 1) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.15));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  if (geoPlaces.length === 0) {
    return (
      <div className="tripmap-empty">
        <div style={{ marginBottom: 12 }}><MapIcon size={48} strokeWidth={1} style={{ opacity: 0.3 }} /></div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>אין מקומות על המפה עדיין</div>
        <div style={{ fontSize: 13, color: 'var(--ink-muted)', maxWidth: 260, textAlign: 'center', lineHeight: 1.5 }}>
          לחצי <RefreshCw size={12} strokeWidth={2} style={{ display:'inline',verticalAlign:'middle' }} /> רענן על מקומות בבנק הרעיונות כדי לאתר אותם על המפה
        </div>
        {destination && (
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--ink-muted)' }}>
            יעד: {destination}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="tripmap-root">
      {/* Map container */}
      <div ref={containerRef} className="tripmap-canvas" />

      {/* Legend */}
      <div className="tripmap-legend">
        {LEGEND.map(({ color, label, icon: LIcon }) => (
          <span key={label} className="tripmap-legend-item">
            <span className="tripmap-legend-dot" style={{ background: color }} />
            <LIcon size={11} strokeWidth={2} style={{ display:'inline',verticalAlign:'middle',marginInlineEnd:2 }} />
            {label}
          </span>
        ))}
      </div>

      {/* Count badge */}
      <div className="tripmap-count">
        {geoPlaces.length} מקומות על המפה
        {places.length > geoPlaces.length && (
          <span style={{ color: 'var(--ink-muted)', fontSize: 11 }}>
            {' '}(+ {places.length - geoPlaces.length} ללא מיקום)
          </span>
        )}
      </div>
    </div>
  );
}
