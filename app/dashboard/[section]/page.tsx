import { notFound, redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { DashboardShell } from '../components/DashboardShell';
import { InfoPanel } from '../components/InfoPanel';
import { ImagePanel } from '../components/ImagePanel';
import { SectionsPanel } from '../components/SectionsPanel';
import { ProductsPanel } from '../components/ProductsPanel';
import { WhatsappPanel } from '../components/WhatsappPanel';
import { SettingsPanel } from '../components/SettingsPanel';
import { OrdersPanel } from '../components/OrdersPanel';
import { OrdersStats } from '../components/OrdersStats';
import { listOrders, getOrderStats } from '@/lib/store/orders/actions';
import type { Metadata } from 'next';
import type { Section, Product } from '@/lib/onboarding/state';

export const dynamic = 'force-dynamic';

const VALID_SECTIONS = ['info', 'image', 'sections', 'products', 'orders', 'whatsapp', 'settings'] as const;
type SectionSlug = (typeof VALID_SECTIONS)[number];

function isValidSection(s: string): s is SectionSlug {
  return (VALID_SECTIONS as readonly string[]).includes(s);
}

const SECTION_TITLES: Record<SectionSlug, string> = {
  info: 'Información',
  image: 'Imagen',
  sections: 'Secciones',
  products: 'Productos',
  orders: 'Pedidos',
  whatsapp: 'WhatsApp',
  settings: 'Configuración',
};

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  const title = isValidSection(section) ? SECTION_TITLES[section] : 'Dashboard';
  return { title: `${title} — Wapy` };
}

export default async function DashboardSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  if (!isValidSection(section)) notFound();

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?redirect=/dashboard');

  const admin = createAdminClient();

  const { data: store } = await admin
    .from('stores')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!store || store.status === 'draft') redirect('/onboarding');

  const [sectionsResult, productsResult] = await Promise.all([
    admin.from('sections').select('*').eq('store_id', store.id).order('position'),
    admin.from('products').select('*').eq('store_id', store.id).order('position'),
  ]);

  const sections: Section[] = sectionsResult.data ?? [];
  const products: Product[] = productsResult.data ?? [];

  const [ordersResult, statsResult] = section === 'orders'
    ? await Promise.all([listOrders({}), getOrderStats('30d')])
    : [null, null];

  const initialOrders = ordersResult && 'orders' in ordersResult ? ordersResult.orders : [];
  const initialStats = statsResult && !('error' in statsResult) ? statsResult : {
    kpis: { revenue_cents: 0, order_count: 0, avg_ticket_cents: 0, confirmation_rate: 0 },
    revenue_by_day: [],
    top_products: [],
    orders_by_section: [],
  };

  const accentColor =
    store.theme &&
    typeof store.theme === 'object' &&
    !Array.isArray(store.theme) &&
    typeof (store.theme as Record<string, unknown>).accent_color === 'string'
      ? (store.theme as Record<string, unknown>).accent_color as string
      : '#F5C84B';

  return (
    <DashboardShell store={store} currentSection={section}>
      {section === 'info' && <InfoPanel store={store} />}
      {section === 'image' && <ImagePanel store={store} />}
      {section === 'sections' && <SectionsPanel store={store} initialSections={sections} />}
      {section === 'products' && <ProductsPanel store={store} initialProducts={products} sections={sections} />}
      {section === 'orders' && (
        <>
          <OrdersStats accentColor={accentColor} initialStats={initialStats} initialRange="30d" />
          <OrdersPanel store={store} initialOrders={initialOrders} sections={sections} />
        </>
      )}
      {section === 'whatsapp' && <WhatsappPanel store={store} />}
      {section === 'settings' && <SettingsPanel store={store} />}
    </DashboardShell>
  );
}
