import { CartProvider } from "./CartContext";

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function StoreLayout({ children, params }: Props) {
  const { slug } = await params;
  return <CartProvider slug={slug}>{children}</CartProvider>;
}
