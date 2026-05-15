import Image from "next/image";

const DEMO_URL =
  process.env.NEXT_PUBLIC_DEMO_URL ?? "http://demo.localhost:3000";

export default function DemoBand() {
  return (
    <section className="py-16 px-4 bg-[#F5C84B]">
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
        <Image
          src="/brand/isotype.png"
          alt="Wapy"
          width={80}
          height={80}
          className="w-16 h-16 md:w-20 md:h-20 flex-shrink-0"
        />
        <div className="flex-1">
          <h2
            className="text-2xl md:text-3xl font-bold text-[#16222E] mb-2"
            style={{ fontFamily: "var(--font-agbalumo)" }}
          >
            Mirá cómo se ve una tienda real
          </h2>
          <p className="text-[#16222E]/70 mb-6">
            Entrá a nuestra tienda de demo y viví la experiencia desde adentro.
          </p>
          <a
            href={DEMO_URL}
            className="inline-flex items-center justify-center px-7 py-3.5 rounded-full bg-[#16222E] text-[#F5C84B] font-bold text-base hover:bg-[#253545] transition-colors shadow-lg"
          >
            Ver tienda de ejemplo →
          </a>
        </div>
      </div>
    </section>
  );
}
