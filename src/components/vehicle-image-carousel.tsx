'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { normalizeVehicleImages } from '@/lib/vehicle-images';

type Variant = 'card' | 'detail' | 'modal';

type VehicleImageCarouselProps = {
  image?: string;
  images?: string[];
  variant?: Variant;
  className?: string;
  alt?: string;
};

export function VehicleImageCarousel({ image, images, variant = 'detail', className = '', alt = '' }: VehicleImageCarouselProps) {
  const sources = [...new Set([image, ...normalizeVehicleImages(images)].filter(Boolean))] as string[];
  const [active, setActive] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const current = sources[active] || image || '/cars/audi.jpg';
  const hasMany = sources.length > 1;
  const showDots = hasMany && (variant === 'card' || variant === 'detail' || variant === 'modal');
  const showThumbnails = hasMany && (variant === 'detail' || variant === 'modal');

  const move = (direction: number) => {
    if (!hasMany) return;
    setActive((index) => (index + direction + sources.length) % sources.length);
  };
  const goTo = (index: number) => setActive(index);

  useEffect(() => { setActive(0); }, [sources.length, image]);

  useEffect(() => {
    if (variant !== 'card' || !hasMany || autoPaused) return;
    const interval = setInterval(() => move(1), 4500);
    return () => clearInterval(interval);
  }, [variant, hasMany, autoPaused, sources.length]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!hasMany) return;
    touchStartX.current = event.clientX;
    setIsDragging(true);
    setAutoPaused(true);
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || touchStartX.current == null) return;
    setDragX(event.clientX - touchStartX.current);
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || touchStartX.current == null) { setIsDragging(false); return; }
    const delta = event.clientX - touchStartX.current;
    if (Math.abs(delta) > 40) move(delta < 0 ? 1 : -1);
    touchStartX.current = null;
    setIsDragging(false);
    setDragX(0);
  };

  const trackStyle: React.CSSProperties = {
    transform: `translateX(calc(${-active * 100}% + ${isDragging ? dragX : 0}px))`,
    transition: isDragging ? 'none' : 'transform .35s cubic-bezier(.45,.05,.2,1)',
  };

  return (
    <div
      ref={containerRef}
      className={`vehicle-image-carousel variant-${variant} ${className}`}
      onMouseEnter={() => variant === 'card' && setAutoPaused(true)}
      onMouseLeave={() => variant === 'card' && setAutoPaused(false)}
    >
      <div
        className="vehicle-image-track"
        style={trackStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {sources.map((source, index) => (
          <div className="vehicle-image-slide" key={`${source}-${index}`} aria-hidden={index !== active}>
            <img src={source} alt={index === active ? alt : ''} draggable={false} />
          </div>
        ))}
      </div>

      {hasMany && variant !== 'card' && (
        <button type="button" className="vehicle-image-arrow previous" onClick={() => move(-1)} aria-label="Previous vehicle image"><ChevronLeft /></button>
      )}
      {hasMany && variant !== 'card' && (
        <button type="button" className="vehicle-image-arrow next" onClick={() => move(1)} aria-label="Next vehicle image"><ChevronRight /></button>
      )}

      {showDots && (
        <div className="vehicle-image-dots" role="tablist">
          {sources.map((_, index) => (
            <button
              type="button"
              key={index}
              className={index === active ? 'active' : ''}
              onClick={() => goTo(index)}
              aria-label={`Go to image ${index + 1}`}
              aria-selected={index === active}
              role="tab"
            />
          ))}
        </div>
      )}

      {hasMany && variant !== 'card' && (
        <span className="vehicle-image-count">{active + 1} / {sources.length}</span>
      )}

      {showThumbnails && (
        <div className="vehicle-image-thumbnails" role="tablist">
          {sources.map((source, index) => (
            <button
              type="button"
              key={`${source}-thumb-${index}`}
              className={index === active ? 'active' : ''}
              onClick={() => goTo(index)}
              aria-label={`Show image ${index + 1}`}
            >
              <img src={source} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
