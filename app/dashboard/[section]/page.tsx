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
import { SubscriptionPanel } from '../components/SubscriptionPanel';
import { CouponsPanel } from '../components/CouponsPanel';
import { listOrders, getOrderStats } from '@/lib/store/orders/actions';
import { getPlanLimits, isUnlimited, type PlanId } from '@/lib/plans/limits';
import { getSubscriptionState, daysLeftInTrial } from '@/lib/subscription/state';
import { getStoreMpConnectionStatus } from '@/lib/store/checkout/oauth';
import type { Coupon } from '@/lib/store/coupons/actions';
import type { Metadata } from 'next';
import type { Section, Product } from '@/lib/onboarding/state';

export const dynamic = 'force-dynamic';

const VALID_SECTIONS = ['info', 'image', 'sections', 'products', 'orders', 'coupons', 'whatsapp', 'settings', 'subscription'] as const;
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
  coupons: 'Cupones',
  whatsapp: 'WhatsApp',
  settings: 'Configuración',
  subscription: 'Suscripción',
};

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  const title = isValidSection(section) ? SECTION_TITLES[section] : 'Dashboard';
  return { title: `${title} — Wapy` };
}

export default async function DashboardSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

  // Decision 6: if subscription is blocked, only allow the subscription section.
  const now = new Date();
  const subState = getSubscriptionState(store, now);
  const daysLeft = daysLeftInTrial(store, now);

  if (subState === 'blocked' && section !== 'subscription') {
    redirect('/dashboard/subscription');
  }

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

  const couponsResult = section === 'coupons'
    ? await admin.from('coupons').select('*').eq('store_id', store.id).order('created_at', { ascending: false })
    : null;
  const initialCoupons: Coupon[] = (couponsResult?.data ?? []) as Coupon[];

  const limits = getPlanLimits(store.plan as PlanId | null);

  // Load Mercado Pago connection state only for the settings section.
  type MpStatus = { connected: boolean; revoked: boolean; mpUserId?: string };
  let mpStatus: MpStatus = { connected: false, revoked: false };
  let checkoutMode: 'whatsapp' | 'mercadopago' = 'whatsapp';
  let mpConnectResult: 'success' | 'error' | null = null;
  let mpError: string | null = null;

  if (section === 'settings') {
    try {
      mpStatus = await getStoreMpConnectionStatus(store.id);
    } catch {
      // Migration not applied or env vars missing — default to no connection.
      mpStatus = { connected: false, revoked: false };
    }
    checkoutMode = (store.checkout_mode ?? 'whatsapp') as 'whatsapp' | 'mercadopago';

    if (searchParams) {
      const sp = await searchParams;
      const connectParam = sp['mp_connect'];
      if (connectParam === 'success' || connectParam === 'error') {
        mpConnectResult = connectParam;
      }
      const errorParam = sp['mp_error'];
      if (typeof errorParam === 'string') {
        mpError = errorParam;
      }
    }
  }

  const accentColor =
    store.theme &&
    typeof store.theme === 'object' &&
    !Array.isArray(store.theme) &&
    typeof (store.theme as Record<string, unknown>).accent_color === 'string'
      ? (store.theme as Record<string, unknown>).accent_color as string
      : '#F5C84B';

  return (
    <DashboardShell store={store} currentSection={section} subState={subState} daysLeftInTrial={daysLeft}>
      {section === 'info' && <InfoPanel store={store} />}
      {section === 'image' && <ImagePanel store={store} />}
      {section === 'sections' && (
        <SectionsPanel
          store={store}
          initialSections={sections}
          sectionsCount={sections.length}
          sectionsLimit={limits.maxSections}
          limitIsUnlimited={isUnlimited(limits.maxSections)}
        />
      )}
      {section === 'products' && (
        <ProductsPanel
          store={store}
          initialProducts={products}
          sections={sections}
          productsCount={products.length}
          productsLimit={limits.maxProducts}
          limitIsUnlimited={isUnlimited(limits.maxProducts)}
          maxImagesPerProduct={limits.maxImagesPerProduct}
          allowVariants={limits.allowVariants}
        />
      )}
      {section === 'orders' && (
        <>
          <OrdersStats accentColor={accentColor} initialStats={initialStats} initialRange="30d" />
          <OrdersPanel store={store} initialOrders={initialOrders} sections={sections} />
        </>
      )}
      {section === 'coupons' && (
        <CouponsPanel store={store} initialCoupons={initialCoupons} />
      )}
      {section === 'whatsapp' && <WhatsappPanel store={store} />}
      {section === 'settings' && (
        <SettingsPanel
          store={store}
          mpStatus={mpStatus}
          checkoutMode={checkoutMode}
          mpConnectResult={mpConnectResult}
          mpError={mpError}
        />
      )}
      {section === 'subscription' && (
        <SubscriptionPanel store={store} subState={subState} daysLeft={daysLeft} />
      )}
    </DashboardShell>
  );
}
