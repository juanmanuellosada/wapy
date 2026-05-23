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

// Inline script that runs before paint to avoid flash of wrong theme.
// Reads localStorage key "wapy-theme-{slug}", falls back to prefers-color-scheme.
// Must be a plain string to be injected as a <script> tag.
function themeScript(slug: string): string {
  return `(function(){
  var key = "wapy-theme-${slug}";
  var saved = null;
  try { saved = localStorage.getItem(key); } catch(e){}
  var theme = saved === "dark" || saved === "light" ? saved
    : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  var el = document.getElementById("store-scope-${slug}");
  if (el && theme === "dark") el.setAttribute("data-theme", "dark");
})();`;
}

export default async function StoreLayout({ children, params }: Props) {
  const { slug } = await params;
  return (
    <CartProvider slug={slug}>
      {/* No-flash theme script: runs synchronously before paint */}
      <script
        dangerouslySetInnerHTML={{ __html: themeScript(slug) }}
      />
      {/* .store-scope isolates store styles from the landing's theme */}
      <div
        id={`store-scope-${slug}`}
        className={`store-scope ${rubik.variable}`}
      >
        {children}
      </div>
    </CartProvider>
  );
}
