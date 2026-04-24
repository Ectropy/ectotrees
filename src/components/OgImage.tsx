import type { ComponentProps } from 'react';
import { WorldCard } from './WorldCard';
import { MapView } from './MapView';
import { TEXT_COLOR } from '@/constants/toolColors';
import './OgImage.css';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const CARD_SCALE = 3.5;
const CARD_NATIVE_W = 128;
const CARD_NATIVE_H = 85;

type Props = {
  wordmark: string;
  tagline: string;
  mapView?: { center: [number, number]; zoom: number };
  card: ComponentProps<typeof WorldCard>;
};

export function OgImage({ wordmark, tagline, mapView, card }: Props) {
  return (
    <div
      className="dark relative overflow-hidden"
      style={{
        width: OG_WIDTH,
        height: OG_HEIGHT,
        background: '#000',
        color: '#f9fafb',
        isolation: 'isolate',
      }}
    >
      <div className="absolute inset-0" style={{ isolation: 'isolate' }}>
        <MapView interactive={false} showControls={false} initialView={mapView} />
      </div>
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(90deg, rgba(0, 0, 0, 0.92) 0%, rgba(0, 0, 0, 0.75) 55%, rgba(15,23,42,0.25) 100%)' }}
      />

      <div className="relative grid h-full grid-cols-2 items-center">
        <div className="flex flex-col justify-center pl-24">
          <div
            className={`text-9xl ${TEXT_COLOR.prominent} text-shadow-sm`}
            style={{ fontFamily: "'RuneScape Quill', serif" }}
          >
            {wordmark}
          </div>
          <div className={`text-2xl font-medium ${TEXT_COLOR.muted} text-shadow-sm`}
          style={{ fontFamily: "'RuneScape Bold 12', serif" }}>
            {tagline}
          </div>
        </div>

        <div className="flex items-center justify-center">
          <div style={{ width: CARD_NATIVE_W * CARD_SCALE, height: CARD_NATIVE_H * CARD_SCALE }}>
            <div style={{ width: CARD_NATIVE_W, transform: `scale(${CARD_SCALE})`, transformOrigin: 'top left' }}>
              <WorldCard {...card} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
