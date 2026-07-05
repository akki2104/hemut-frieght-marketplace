"use client";

// Leaflet route map: numbered stop markers + a road-following polyline from the
// OSRM public API (no key). Falls back to a straight line if OSRM is unreachable.
// Imported dynamically with ssr:false — Leaflet touches `window` at module load.

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";

import type { Stop } from "@/lib/types";

type LatLng = [number, number];

function numberedIcon(n: number, kind: "pickup" | "delivery"): L.DivIcon {
  const color = kind === "pickup" ? "#059669" : "#dc2626";
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [map, points]);
  return null;
}

interface OsrmResult {
  geometry: LatLng[];
  distanceMi: number;
  durationLabel: string;
}

async function fetchOsrmRoute(points: LatLng[]): Promise<OsrmResult | null> {
  // OSRM expects lng,lat pairs.
  const coords = points.map(([lat, lng]) => `${lng},${lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) return null;
  const geometry: LatLng[] = route.geometry.coordinates.map(
    ([lng, lat]: [number, number]) => [lat, lng]
  );
  const distanceMi = Math.round(route.distance / 1609.34);
  const mins = Math.round(route.duration / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return {
    geometry,
    distanceMi,
    durationLabel: h > 0 ? `${h}h ${m}m` : `${m}m`,
  };
}

export function RouteMap({ stops }: { stops: Stop[] }) {
  const points = useMemo<LatLng[]>(
    () => stops.map((s) => [s.lat, s.lng]),
    [stops]
  );
  const [route, setRoute] = useState<OsrmResult | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    let active = true;
    if (points.length < 2) return;
    fetchOsrmRoute(points)
      .then((r) => {
        if (!active) return;
        if (r) setRoute(r);
        else setUsedFallback(true);
      })
      .catch(() => active && setUsedFallback(true));
    return () => {
      active = false;
    };
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-400">
        No coordinates for this route.
      </div>
    );
  }

  const line = route?.geometry ?? points; // fallback: straight line

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1 overflow-hidden rounded-lg border border-zinc-200">
        <MapContainer
          center={points[0]}
          zoom={5}
          className="h-full w-full"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Polyline positions={line} pathOptions={{ color: "#2563eb", weight: 4 }} />
          {stops.map((s, i) => (
            <Marker
              key={s.id}
              position={[s.lat, s.lng]}
              icon={numberedIcon(i + 1, s.stop_type)}
            />
          ))}
          <FitBounds points={points} />
        </MapContainer>
      </div>
      <div className="mt-2 flex items-center justify-between px-1 text-xs text-zinc-500">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" /> Pickup
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600" /> Delivery
          </span>
        </span>
        {route ? (
          <span className="font-medium text-zinc-700">
            {route.distanceMi.toLocaleString()} mi · {route.durationLabel}
          </span>
        ) : usedFallback ? (
          <span className="text-amber-600">Routing unavailable — straight line</span>
        ) : (
          <span>Calculating route…</span>
        )}
      </div>
    </div>
  );
}
