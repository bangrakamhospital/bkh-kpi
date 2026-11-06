/**
 * Validates a post-login redirect target: internal path only
 * (no scheme, no host, no protocol-relative "//", no backslashes or
 * control characters). Falls back to "/". Pure, usable on client/server.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || raw.length > 2048) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(raw)) {
    return "/";
  }
  try {
    const base = "http://internal.invalid";
    const url = new URL(raw, base);
    if (url.origin !== base) return "/";
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (url.pathname === "/login" || url.pathname.startsWith("/api/")) {
      return "/";
    }
    return path;
  } catch {
    return "/";
  }
}
