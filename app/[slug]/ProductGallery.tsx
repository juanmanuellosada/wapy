"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#e5e7eb"/><text x="100" y="105" font-family="system-ui,sans-serif" font-size="14" fill="#9ca3af" text-anchor="middle">Sin imagen</text></svg>'
  );

interface Props {
  imageUrls: string[];
  alt: string;
  accentColor: string;
}

export default function ProductGallery({ imageUrls, alt, accentColor }: Props) {
  const images = imageUrls.length > 0 ? imageUrls : [PLACEHOLDER_IMAGE];
  const isPlaceholder = imageUrls.length === 0;

  // Single image — render exactly as before
  if (images.length === 1) {
    return (
      <Image
        src={images[0]}
        alt={alt}
        fill
        sizes="(max-width: 640px) 100vw, 576px"
        className="object-cover"
        unoptimized={images[0].startsWith("data:")}
      />
    );
  }

  // Multiple images
  return <MultiImageGallery images={images} alt={alt} accentColor={accentColor} isPlaceholder={isPlaceholder} />;
}

function MultiImageGallery({
  images,
  alt,
  accentColor,
  isPlaceholder,
}: {
  images: string[];
  alt: string;
  accentColor: string;
  isPlaceholder: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Track which slide is visible via IntersectionObserver (mobile scroll-snap)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const observers: IntersectionObserver[] = [];

    images.forEach((_, i) => {
      const el = slideRefs.current[i];
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveIndex(i);
        },
        { root: container, threshold: 0.6 }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => {
      observers.forEach((o) => o.disconnect());
    };
  }, [images.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function scrollTo(index: number) {
    const el = slideRefs.current[index];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    }
    setActiveIndex(index);
  }

  function prev() {
    scrollTo(Math.max(0, activeIndex - 1));
  }

  function next() {
    scrollTo(Math.min(images.length - 1, activeIndex + 1));
  }

  return (
    <div className="flex flex-col w-full">
      {/* Main image area with scroll-snap — aspect ratio defined on each slide */}
      <div
        ref={scrollRef}
        className="relative flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        aria-label={`Galería de imágenes de ${alt}`}
        role="region"
      >
        {images.map((url, i) => (
          <div
            key={i}
            ref={(el) => { slideRefs.current[i] = el; }}
            className="relative shrink-0 w-full snap-start"
            style={{ aspectRatio: "4/3", minWidth: "100%" }}
          >
            <Image
              src={url}
              alt={isPlaceholder ? alt : `${alt} — imagen ${i + 1} de ${images.length}`}
              fill
              sizes="(max-width: 640px) 100vw, 576px"
              className="object-cover"
              unoptimized={url.startsWith("data:")}
            />
          </div>
        ))}

        {/* Desktop prev/next arrows — hidden on mobile */}
        {activeIndex > 0 && (
          <button
            onClick={prev}
            className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 h-8 w-8 items-center justify-center rounded-full cursor-pointer transition-opacity hover:opacity-100 opacity-80"
            style={{ background: "rgba(0,0,0,0.45)", color: "#fff" }}
            aria-label="Imagen anterior"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {activeIndex < images.length - 1 && (
          <button
            onClick={next}
            className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 h-8 w-8 items-center justify-center rounded-full cursor-pointer transition-opacity hover:opacity-100 opacity-80"
            style={{ background: "rgba(0,0,0,0.45)", color: "#fff" }}
            aria-label="Imagen siguiente"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Mobile: dot indicators */}
      <div
        className="flex sm:hidden items-center justify-center gap-1.5 py-2"
        aria-hidden="true"
      >
        {images.map((_, i) => (
          <button
            key={i}
            onClick={() => scrollTo(i)}
            className="h-1.5 rounded-full transition-all cursor-pointer"
            style={{
              width: i === activeIndex ? "16px" : "6px",
              background: i === activeIndex ? accentColor : "var(--store-border-strong)",
            }}
            aria-label={`Ir a imagen ${i + 1} de ${images.length}`}
          />
        ))}
      </div>

      {/* Desktop: thumbnail row */}
      <div
        className="hidden sm:flex items-center gap-1.5 p-2 overflow-x-auto scrollbar-none"
        style={{ scrollbarWidth: "none" }}
        aria-label="Miniaturas de la galería"
      >
        {images.map((url, i) => (
          <button
            key={i}
            onClick={() => scrollTo(i)}
            className="relative shrink-0 rounded-lg overflow-hidden cursor-pointer transition-opacity"
            style={{
              width: "52px",
              height: "52px",
              outline: i === activeIndex ? `2px solid ${accentColor}` : "2px solid transparent",
              outlineOffset: "1px",
              opacity: i === activeIndex ? 1 : 0.65,
            }}
            aria-label={`Imagen ${i + 1} de ${images.length}`}
            aria-pressed={i === activeIndex}
          >
            <Image
              src={url}
              alt=""
              fill
              sizes="52px"
              className="object-cover"
              unoptimized={url.startsWith("data:")}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
