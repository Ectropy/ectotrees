import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LOCATION_COORDS } from '../../shared/hints.ts';
import { hintsForLocation } from '../constants/evilTree.ts';

// Game (x, y) maps to Leaflet LatLng(y, x) under CRS.Simple — y=game-y, x=game-x.
// The default view matches mejrs.github.io/rs3 defaults so the initial map is known-good.
const DEFAULT_CENTER: [number, number] = [3232, 3232]; // mejrs's default setView center
const DEFAULT_ZOOM = 2;

// mejrs's RS3 tile layer: surface world is mapId 28 (matches the default at
// mejrs.github.io/rs3?m=28). Tiles are hotlinked from the community-maintained
// layers_rs3 repo — same source the RuneScape Wiki currently uses for its
// RS3 interactive map.
const MAP_ID = 28;
const OVERWORLD_PLANE = 0;
const TILE_URL =
  'https://raw.githubusercontent.com/mejrs/layers_rs3/master/map_squares/{mapId}/{zoom}/{plane}_{x}_{y}.png';
const ICON_TILE_URL =
  'https://raw.githubusercontent.com/mejrs/layers_rs3/master/icon_squares/{mapId}/{zoom}/{plane}_{x}_{y}.png';

// Flip Leaflet's top-left tile origin to the game's bottom-left origin.
class Rs3TileLayer extends L.TileLayer {
  override getTileUrl(coords: L.Coords): string {
    return L.Util.template(this._url, {
      mapId: MAP_ID,
      zoom: coords.z,
      plane: OVERWORLD_PLANE,
      x: coords.x,
      y: -(1 + coords.y),
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function buildPopupHtml(name: string, hints: string[]): string {
  const hintList = hints.map(h => `<li>${escapeHtml(h)}</li>`).join('');
  return `<div style="min-width:180px"><strong>${escapeHtml(name)}</strong><ul style="margin:4px 0 0;padding-left:18px">${hintList}</ul></div>`;
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el, {
      crs: L.CRS.Simple,
      minZoom: -4,
      maxZoom: 5,
      doubleClickZoom: false,
      attributionControl: false,
      maxBounds: [[-1000, -1000], [13800, 7400]],
      maxBoundsViscosity: 0.5,
    });

    new Rs3TileLayer(TILE_URL, {
      minZoom: -4,
      maxZoom: 5,
      maxNativeZoom: 3,
      tileSize: 256,
      noWrap: true,
    }).addTo(map);

    const iconLayer = new Rs3TileLayer(ICON_TILE_URL, {
      minZoom: 0,
      maxZoom: 5,
      maxNativeZoom: 4,
      tileSize: 256,
      noWrap: true,
      pane: 'overlayPane',
    }).addTo(map);

    L.control.layers({}, { Icons: iconLayer }, { position: 'topright', collapsed: false }).addTo(map);

    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    for (const [name, { x, y }] of Object.entries(LOCATION_COORDS)) {
      L.circleMarker([y, x], {
        radius: 6,
        color: '#fbbf24',
        fillColor: '#f59e0b',
        fillOpacity: 0.9,
        weight: 2,
      })
        .addTo(map)
        .bindPopup(buildPopupHtml(name, hintsForLocation(name)));
    }

    return () => {
      map.remove();
    };
  }, []);

  return (
    <div className="h-full w-full bg-black">
      <div ref={containerRef} className="h-full w-full" style={{ background: '#000' }} />
    </div>
  );
}
