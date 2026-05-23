import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

/**
 * Wapy proxy — proxy.ts (Next.js 16+ replaces middleware.ts)
 *
 * Responsibilities:
 * 1. Auth protection: /onboarding/*, /dashboard/*, /admin/* require a valid session.
 * 2. Role-based routing: /admin/* requires role='superadmin'; others → /onboarding.
 * 3. Session cookie refresh: @supabase/ssr refreshes access tokens on every matched request.
 *
 * Public storefronts are handled by the /[slug] dynamic route — no subdomain routing needed.
 *
 * Protected routes: /onboarding, /dashboard, /admin
 * To add more protected routes in future phases, update PROTECTED_PREFIXES below.
 */

// Add new protected route prefixes here when future phases introduce them.
const PROTECTED_PREFIXES = ["/onboarding", "/dashboard", "/admin"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Auth protection for private routes ---
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  // Build a mutable response to carry refreshed cookies forward.
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Read cookies from the incoming request.
        getAll: () => request.cookies.getAll(),
        // Write refreshed cookies to both the request (for downstream handlers)
        // and the response (so the browser receives the updated tokens).
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // getUser() contacts Supabase Auth to return a verified user (not just a
  // cached cookie) and refreshes the session if the access token is near expiry.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session → redirect to /login with the original path preserved.
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl, { status: 307 });
  }

  // Role-based guard: /admin/* requires superadmin.
  if (pathname.startsWith("/admin")) {
    const { data: userRow } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userRow || userRow.role !== "superadmin") {
      return NextResponse.redirect(new URL("/onboarding", request.url), {
        status: 307,
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on all paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico
     * - /brand/ (public brand assets)
     */
    "/((?!_next/static|_next/image|favicon.ico|brand/).*)",
  ],
};
