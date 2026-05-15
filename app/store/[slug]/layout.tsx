import { Rubik } from "next/font/google";
import { CartProvider } from "./CartContext";

const rubik = Rubik({
  subsets: ["latin"],
  variable: "--font-rubik",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function StoreLayout({ children, params }: Props) {
  const { slug } = await params;
  return (
    <CartProvider slug={slug}>
      {/* .store-scope isolates store styles from the landing's theme */}
      <div className={`store-scope ${rubik.variable}`}>
        {children}
      </div>
    </CartProvider>
  );
}
