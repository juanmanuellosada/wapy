export interface Product {
  id: string;
  sectionId: string;
  name: string;
  description: string;
  price: number; // ARS, integer
  image: string; // path relative to /public, e.g. "/products/remera-blanca.jpg"
}

export interface Section {
  id: string;
  name: string;
}

export interface Store {
  slug: string;
  name: string;
  tagline: string;
  accentColor: string;      // hex, e.g. "#2D6A4F"
  accentForeground: string; // hex for text on accentColor background
  // WhatsApp number in international format without + or spaces.
  // IMPORTANT: replace with the real store owner's number before going live.
  whatsappNumber: string;
  sections: Section[];
  products: Product[];
}

const stores: Record<string, Store> = {
  demo: {
    slug: "demo",
    name: "Trama",
    tagline: "Ropa con carácter. Hecha para vos.",
    accentColor: "#2D6A4F",
    accentForeground: "#FFFFFF",
    // PLACEHOLDER — cambiar por el número real del local antes de publicar.
    // Formato: código de país + código de área sin 0 + número sin 15.
    // Ejemplo real: 5491155667788
    whatsappNumber: "5491100000000",
    sections: [
      { id: "remeras", name: "Remeras" },
      { id: "buzos", name: "Buzos" },
      { id: "pantalones", name: "Pantalones" },
      { id: "abrigos", name: "Abrigos" },
    ],
    products: [
      // --- Remeras ---
      {
        id: "rem-01",
        sectionId: "remeras",
        name: "Remera Básica Blanca",
        description:
          "100% algodón peinado, talle amplio. Corte recto con cuello redondo reforzado. Ideal para usar sola o en capas.",
        price: 12500,
        image: "/products/remera-blanca.jpg",
      },
      {
        id: "rem-02",
        sectionId: "remeras",
        name: "Remera Negra Premium",
        description:
          "Tela jersey heavyweight de 200 g/m². Costuras flatlock para mayor durabilidad. El básico que nunca falla.",
        price: 14000,
        image: "/products/remera-negra.jpg",
      },
      {
        id: "rem-03",
        sectionId: "remeras",
        name: "Remera Rayas Marineras",
        description:
          "Combinación clásica en azul y blanco. Tela liviana y transpirable, perfecta para los días de calor.",
        price: 13500,
        image: "/products/remera-rayas.jpg",
      },
      {
        id: "rem-04",
        sectionId: "remeras",
        name: "Remera Oversize",
        description:
          "Corte oversized con hombro caído y largo XL. Diseño minimalista que combina con todo.",
        price: 15000,
        image: "/products/remera-oversize.jpg",
      },
      {
        id: "rem-05",
        sectionId: "remeras",
        name: "Remera Estampada Vintage",
        description:
          "Estampado exclusivo de colección con efecto desgastado. Edición limitada — pocas unidades.",
        price: 16500,
        image: "/products/remera-estampada.jpg",
      },

      // --- Buzos ---
      {
        id: "buz-01",
        sectionId: "buzos",
        name: "Buzo Gris Melange",
        description:
          "Buzo clásico en gris melange con puños y cintura elastizados. Interno afelpado para mayor abrigo.",
        price: 28000,
        image: "/products/buzo-gris.jpg",
      },
      {
        id: "buz-02",
        sectionId: "buzos",
        name: "Buzo Negro Esencial",
        description:
          "El esencial de temporada: cuello redondo, corte recto y tela densa anti-pilling.",
        price: 27000,
        image: "/products/buzo-negro.jpg",
      },
      {
        id: "buz-03",
        sectionId: "buzos",
        name: "Hoodie con Canguro",
        description:
          "Con capucha de doble capa y bolsillo canguro central. Excelente relación abrigo-peso.",
        price: 32000,
        image: "/products/buzo-hoodie.jpg",
      },
      {
        id: "buz-04",
        sectionId: "buzos",
        name: "Buzo Cropped",
        description:
          "Largo cropped por encima de la cintura, ideal para combinar con pantalones de tiro alto.",
        price: 26000,
        image: "/products/buzo-cropped.jpg",
      },
      {
        id: "buz-05",
        sectionId: "buzos",
        name: "Buzo Estampado Colección",
        description:
          "Estampado de temporada en frente con técnica de serigrafia. Tela 80% algodón / 20% poliéster.",
        price: 33500,
        image: "/products/buzo-estampado.jpg",
      },

      // --- Pantalones ---
      {
        id: "pan-01",
        sectionId: "pantalones",
        name: "Jean Slim Clásico",
        description:
          "Corte slim fit con pequeño stretch para mayor comodidad. Lavado stone que nunca pasa de moda.",
        price: 35000,
        image: "/products/pantalon-jean.jpg",
      },
      {
        id: "pan-02",
        sectionId: "pantalones",
        name: "Pantalón Negro Recto",
        description:
          "Gabardina liviana, corte recto con pliegues sutiles. Versátil: desde el trabajo hasta la salida.",
        price: 38000,
        image: "/products/pantalon-negro.jpg",
      },
      {
        id: "pan-03",
        sectionId: "pantalones",
        name: "Cargo Utilitario",
        description:
          "Seis bolsillos funcionales, trabillas anchas y cintura elastizada en los costados.",
        price: 40000,
        image: "/products/pantalon-cargo.jpg",
      },
      {
        id: "pan-04",
        sectionId: "pantalones",
        name: "Chino Beige",
        description:
          "Tela chino importada, tiro medio y bota angosta. El pantalón que pide ser usado todos los días.",
        price: 36000,
        image: "/products/pantalon-chino.jpg",
      },
      {
        id: "pan-05",
        sectionId: "pantalones",
        name: "Jogger Deportivo",
        description:
          "Puños en tobillo, cintura con cordón y bolsillos laterales con cierre. Comodidad sin resignar estilo.",
        price: 29000,
        image: "/products/pantalon-jogger.jpg",
      },

      // --- Abrigos ---
      {
        id: "abr-01",
        sectionId: "abrigos",
        name: "Trench Clásico",
        description:
          "Largo por la rodilla con doble botonadura y cinturón al tono. Tela impermeable ligera.",
        price: 72000,
        image: "/products/abrigo-trench.jpg",
      },
      {
        id: "abr-02",
        sectionId: "abrigos",
        name: "Puffer Ultraliviano",
        description:
          "Relleno de fibra sintética de alto loft. Se dobla en su propio bolsillo. Ideal para viajes.",
        price: 68000,
        image: "/products/abrigo-puffer.jpg",
      },
      {
        id: "abr-03",
        sectionId: "abrigos",
        name: "Sobretodo Paño",
        description:
          "Paño importado de lana y poliéster. Corte oversize, cierre con botones nácar. Para el frío de verdad.",
        price: 95000,
        image: "/products/abrigo-sobretodo.jpg",
      },
      {
        id: "abr-04",
        sectionId: "abrigos",
        name: "Parka Impermeable",
        description:
          "Con capucha ajustable, bolsillos internos y externos. Repele el agua sin perder transpirabilidad.",
        price: 78000,
        image: "/products/abrigo-parka.jpg",
      },
      {
        id: "abr-05",
        sectionId: "abrigos",
        name: "Blazer Estructurado",
        description:
          "Tela tweed con hombreras sutiles. Cierre de un botón, bolsillos en pecho y laterales.",
        price: 62000,
        image: "/products/abrigo-blazer.jpg",
      },
    ],
  },
};

export function getStore(slug: string): Store | null {
  return stores[slug] ?? null;
}
