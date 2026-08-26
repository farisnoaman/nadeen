'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { normalizeVehicleImages } from '@/lib/vehicle-images';

type VehicleImageCarouselProps = {
  image?: string;
  images?: string[];
  className?: string;
};

export function VehicleImageCarousel({ image, images, className = '' }: VehicleImageCarouselProps) {
  const sources = [...new Set([image, ...normalizeVehicleImages(images)])].filter(Boolean) as string[];
  const [active, setActive] = useState(0);
  const current = sources[active] || image || '/cars/audi.jpg';

  const move = (direction: number) => {
    setActive(index => (index + direction + sources.length) % sources.length);
  };

  return <div className={`vehicle-image-carousel ${className}`}>
    <img src={current} alt="" />
    {sources.length > 1 && <>
      <button type="button" className="vehicle-image-arrow previous" onClick={() => move(-1)} aria-label="Previous vehicle image"><ChevronLeft /></button>
      <button type="button" className="vehicle-image-arrow next" onClick={() => move(1)} aria-label="Next vehicle image"><ChevronRight /></button>
      <span className="vehicle-image-count">{active + 1} / {sources.length}</span>
    </>}
  </div>;
}
