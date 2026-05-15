import { NextRequest, NextResponse } from "next/server";

/**
 * Wapy subdomain routing — proxy.ts
 *
 * Root domains → landing page at /.
 * Subdomains   → /store/{slug} (rewritten internally, URL unchanged for the user).
 *
 * Local dev:
 *   http://localhost:3000         → landing page
 *   http://demo.localhost:3000    → /store/demo  (store placeholder)
 *
 * Note: *.localhost resolves automatically in modern browsers (Chrome, Firefox,
 * Safari) without any /etc/hosts entry. Just navigate to demo.localhost:3000.
 *
 * Production:
 *   Set PROD_ROOT_DOMAIN=wapy.app in your hosting env vars.
 *   http://demo.wapy.app          → /store/demo
 */

const ROOT_DOMAINS = [
  "localhost",
  "127.0.0.1",
  ...(process.env.PROD_ROOT_DOMAIN ? [process.env.PROD_ROOT_DOMAIN] : []),
];

function getSubdomain(hostname: string): string | null {
  // Strip port: "demo.localhost:3000" → "demo.localhost"
  const host = hostname.split(":")[0];

  for (const root of ROOT_DOMAINS) {
    if (host === root) {
      return null; // exact root host — no subdomain
    }
    if (host.endsWith(`.${root}`)) {
      const sub = host.slice(0, host.length - root.length - 1);
      if (sub === "www") return null;
      return sub;
    }
  }
  return null;
}

export function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";
  const subdomain = getSubdomain(hostname);

  if (subdomain) {
    const url = request.nextUrl.clone();
    url.pathname = `/store/${subdomain}${request.nextUrl.pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Run on all paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico
     * - /brand/ (public brand assets)
     * - /store/ (avoid infinite rewrite loop)
     */
    "/((?!_next/static|_next/image|favicon.ico|brand/|store/).*)",
  ],
};
