import { z } from 'zod';

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
const E164_REGEX = /^\+[1-9]\d{6,14}$/;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export const basicsSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(80, 'Máximo 80 caracteres'),
  slug: z
    .string()
    .min(2, 'El slug debe tener al menos 2 caracteres')
    .max(32, 'Máximo 32 caracteres')
    .regex(SLUG_REGEX, 'Solo minúsculas, números y guiones. Debe empezar y terminar con letra o número.'),
  description: z.string().max(280, 'Máximo 280 caracteres').optional(),
});

export const lookSchema = z.object({
  accent_color: z
    .string()
    .regex(HEX_COLOR_REGEX, 'Ingresá un color hexadecimal válido (ej: #F5C84B)'),
  logo_url: z.string().url().optional().nullable(),
});

const sectionItemSchema = z.object({
  id: z.string().optional(), // present for existing, absent for new
  name: z.string().min(1, 'El nombre de la sección es requerido').max(40, 'Máximo 40 caracteres'),
  slug: z.string().min(1),
  position: z.number().int().min(0),
});

export const sectionsSchema = z.object({
  sections: z
    .array(sectionItemSchema)
    .min(1, 'Agregá al menos una sección para continuar'),
});

const productItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'El nombre es requerido').max(120, 'Máximo 120 caracteres'),
  description: z.string().max(500, 'Máximo 500 caracteres').optional().nullable(),
  price_cents: z.number().int().min(0, 'El precio no puede ser negativo'),
  stock: z.number().int().min(0).optional().nullable(),
  section_id: z.string().optional().nullable(),
  image_urls: z.array(z.string()).max(5, 'Máximo 5 imágenes por producto').default([]),
  position: z.number().int().min(0),
  is_active: z.boolean().default(true),
});

export const productsSchema = z.object({
  products: z
    .array(productItemSchema)
    .min(1, 'Agregá al menos un producto para continuar'),
});

export const whatsappSchema = z.object({
  whatsapp_number: z
    .string()
    .regex(E164_REGEX, 'Número inválido. Debe empezar con + y código de país (ej: +5491112345678).'),
});

// Inferred types
export type BasicsData = z.infer<typeof basicsSchema>;
export type LookData = z.infer<typeof lookSchema>;
export type SectionsData = z.infer<typeof sectionsSchema>;
export type ProductsData = z.infer<typeof productsSchema>;
export type WhatsappData = z.infer<typeof whatsappSchema>;
export type SectionItem = z.infer<typeof sectionItemSchema>;
export type ProductItem = z.infer<typeof productItemSchema>;
