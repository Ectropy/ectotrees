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
        <MapView interactive={false} showControls={false} showIcons={false} initialView={mapView} />
      </div>
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(90deg, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.60) 55%, rgba(0, 0, 0, 0.10) 100%)' }}
      />

      <div className="relative grid h-full grid-cols-2 items-center">
        <div className="flex flex-col justify-center pl-24">
          <div
            className={`text-[175px] leading-none -mt-40 ${TEXT_COLOR.prominent}`}
            style={{ fontFamily: "'RuneScape Quill', serif",
              textShadow: [
                '-2px 0 0 rgba(0,0,0,1)',
                '2px 0 0 rgba(0,0,0,1)',
                '0 -2px 0 rgba(0,0,0,1)',
                '0 2px 0 rgba(0,0,0,1)',
                '0 6px 12px rgba(0,0,0,0.9)',
              ].join(', '),
             }}
          >
            {wordmark}
          </div>
          <div className={`text-[35px] leading-none font-medium ${TEXT_COLOR.muted}`}
          style={{ fontFamily: "'RuneScape Bold 12', serif", 
                textShadow: [
                '-2px 0 0 rgba(0,0,0,1)',
                '2px 0 0 rgba(0,0,0,1)',
                '0 -2px 0 rgba(0,0,0,1)',
                '0 2px 0 rgba(0,0,0,1)',
                '0 6px 12px rgba(0,0,0,0.9)',
              ].join(', '),
          }}>
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
