// Skeleton shown by Next.js App Router while /[slug]/page.tsx is resolving.
// Mirrors the real store layout (header + hero + sections + product grid)
// without requiring the accent color or any store data.
import type { CSSProperties } from "react";

function SkeletonPulse({
  className,
  style,
}: {
  className: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-200 dark:bg-gray-800 ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

function HeaderSkeleton() {
  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-900">
      {/* Main header row — h-14 matches real header */}
      <div className="mx-auto flex max-w-6xl items-center px-4 sm:px-6 h-14 gap-2 sm:gap-3">
        {/* Logo circle */}
        <SkeletonPulse className="h-8 w-8 rounded-full shrink-0" />
        {/* Store name */}
        <SkeletonPulse className="h-4 w-28 shrink-0" />

        {/* Desktop section nav pills */}
        <div className="hidden md:flex items-center gap-1.5 flex-1 justify-center">
          {[56, 72, 48, 64].map((w, i) => (
            <SkeletonPulse key={i} className={`h-6 rounded-full`} style={{ width: w }} />
          ))}
        </div>

        {/* Right controls: search + theme + cart */}
        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
          <SkeletonPulse className="hidden sm:block h-8 w-32 rounded-full" />
          <SkeletonPulse className="h-9 w-9 rounded-full" />
          <SkeletonPulse className="h-9 w-24 rounded-full" />
        </div>
      </div>

      {/* Mobile section nav row */}
      <div className="md:hidden flex gap-1.5 px-4 pb-3">
        {[48, 64, 52, 56].map((w, i) => (
          <SkeletonPulse key={i} className="h-6 rounded-full shrink-0" style={{ width: w }} />
        ))}
      </div>
    </header>
  );
}

function HeroSkeleton() {
  return (
    <section className="py-16 sm:py-24 px-4 sm:px-6 bg-white dark:bg-gray-950">
      <div className="mx-auto max-w-6xl flex flex-col gap-3">
        {/* Logo large circle */}
        <SkeletonPulse className="h-24 w-24 rounded-full mb-2" />
        {/* Eyebrow */}
        <SkeletonPulse className="h-3 w-20" />
        {/* Headline */}
        <SkeletonPulse className="h-12 sm:h-16 w-64 sm:w-80" />
        {/* Description */}
        <SkeletonPulse className="h-4 w-72 mt-1" />
        <SkeletonPulse className="h-4 w-56" />
        {/* Decorative rule */}
        <SkeletonPulse className="mt-6 h-px w-16 rounded-none" />
      </div>
    </section>
  );
}

function ProductCardSkeleton() {
  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800"
      aria-hidden="true"
    >
      {/* 3:4 image area */}
      <SkeletonPulse className="w-full rounded-none" style={{ aspectRatio: "3/4" }} />
      {/* Info */}
      <div className="flex flex-col gap-2 p-3 sm:p-4">
        {/* Product name */}
        <SkeletonPulse className="h-4 w-4/5" />
        <SkeletonPulse className="h-3 w-3/5" />
        {/* Price + button row */}
        <div className="flex items-center justify-between gap-2 mt-1">
          <SkeletonPulse className="h-5 w-16" />
          <SkeletonPulse className="h-7 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function SectionSkeleton({ cardCount = 4 }: { cardCount?: number }) {
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {/* Section header: title + rule */}
      <div className="flex items-center gap-3">
        <SkeletonPulse className="h-6 w-36" />
        <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800 rounded-none" aria-hidden="true" />
        <SkeletonPulse className="h-4 w-4 rounded-full shrink-0" />
      </div>
      {/* Product grid — 2 cols mobile / 3 md / 4 lg */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
        {Array.from({ length: cardCount }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export default function StoreLoading() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <HeaderSkeleton />
      <HeroSkeleton />
      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-10 sm:py-14 flex flex-col gap-14 sm:gap-20">
        {/* Render 2 section skeletons — common case covers most stores */}
        <SectionSkeleton cardCount={4} />
        <SectionSkeleton cardCount={4} />
      </main>
    </div>
  );
}
