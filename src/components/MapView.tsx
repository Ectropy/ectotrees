import { useEffect, useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TreeDeciduous } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
    return L.Util.template((this as unknown as { _url: string })._url, {
      mapId: MAP_ID,
      zoom: coords.z,
      plane: OVERWORLD_PLANE,
      x: coords.x,
      y: -(1 + coords.y),
    });
  }
}

// Tailwind green-400 — matches TREE_COLOR.text so the map marker agrees with
// the rest of the tree UI. Tailwind classes do not reach into the rendered SVG
// string, so the hex has to be inline.
const TREE_GREEN = '#4ade80';

type MarkerStyle = { color: string; Icon: LucideIcon };

// Future state-based variation (dying, dead, alive) swaps the `color` / `Icon`
// fields here; the rest of the marker shell is identical.
function createTreeMarkerIcon({ color, Icon }: MarkerStyle): L.DivIcon {
  const iconSvg = renderToStaticMarkup(<Icon size={24} color={color} strokeWidth={2.25} />);
  // Pin outline: 44x44 rounded-square head, tapering over 10px to a tip at (22,53).
  // Stroke is inset by 1px so a 2px stroke stays fully inside the 44x54 viewBox.
  const pinPath =
    'M5,1 L39,1 Q43,1 43,5 L43,43 L32,43 L22,53 L12,43 L1,43 L1,5 Q1,1 5,1 Z';
  // Nest the lucide <svg> inside the outer <svg> via a translating <g>. Keeping
  // everything in one SVG root avoids sibling stacking-context issues and lets
  // `filter: drop-shadow` trace the whole pin silhouette cleanly.
  const html =
    `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="54" viewBox="0 0 44 54" ` +
    `style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5))">` +
    `<path d="${pinPath}" fill="#000" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>` +
    `<g transform="translate(10 10)">${iconSvg}</g>` +
    `</svg>`;
  return L.divIcon({
    html,
    className: '',
    iconSize: [44, 54],
    iconAnchor: [22, 53],
    popupAnchor: [0, -53],
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function buildPopupHtml(name: string, hints: string[]): string {
  const hintList = hints.map(h => `<li>${escapeHtml(h)}</li>`).join('');
  return `<div style="min-width:180px"><strong>${escapeHtml(name)}</strong><ul style="margin:4px 0 0;padding-left:18px">${hintList}</ul></div>`;
}

type MapViewProps = {
  interactive?: boolean;
  showControls?: boolean;
  showIcons?: boolean;
  initialView?: { center: [number, number]; zoom: number };
};

export function MapView({ interactive = true, showControls = true, showIcons = true, initialView }: MapViewProps = {}) {
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
      dragging: interactive,
      scrollWheelZoom: interactive,
      touchZoom: interactive,
      keyboard: interactive,
      boxZoom: interactive,
      zoomControl: interactive && showControls,
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
    })
    
    if (showIcons){
      iconLayer.addTo(map);
    }

    if (showControls) {
      L.control.layers({}, { Icons: iconLayer }, { position: 'topright', collapsed: false }).addTo(map);
    }

    const { center, zoom } = initialView ?? { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
    map.setView(center, zoom);

    const treeIcon = createTreeMarkerIcon({ color: TREE_GREEN, Icon: TreeDeciduous });
    for (const [name, { x, y }] of Object.entries(LOCATION_COORDS)) {
      const marker = L.marker([y, x], { icon: treeIcon, interactive }).addTo(map);
      if (interactive) {
        marker.bindPopup(buildPopupHtml(name, hintsForLocation(name)));
      }
    }

    if (import.meta.env.DEV) {
      map.on('moveend', () => {
        const c = map.getCenter();
        console.log(`center: [${Math.round(c.lat)}, ${Math.round(c.lng)}], zoom: ${map.getZoom()}`);
      });
    }

    return () => {
      map.remove();
    };
  }, [interactive, showControls, showIcons, initialView]);

  return (
    <div className="h-full w-full bg-black">
      <div ref={containerRef} className="h-full w-full" style={{ background: '#000' }} />
    </div>
  );
}
