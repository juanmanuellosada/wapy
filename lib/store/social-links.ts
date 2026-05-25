export type SocialLinks = {
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  twitter?: string | null;
  youtube?: string | null;
};

const FACEBOOK_NON_USERNAME = new Set(["pages", "people", "groups", "events", "marketplace"]);

export function extractSocialHandle(
  network: keyof SocialLinks,
  url: string
): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const first = segments[0].replace(/^@/, "");

  if (network === "facebook") {
    // profile.php, pages/..., people/..., etc. — not a clean username
    if (FACEBOOK_NON_USERNAME.has(first) || first === "profile.php") return null;
    // Numeric-only paths (profile IDs) are not useful handles
    if (/^\d+$/.test(first)) return null;
  }

  return first || null;
}
