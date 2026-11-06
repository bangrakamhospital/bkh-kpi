import { SSO_PROVIDER_ID } from "@/lib/auth/sso-id";

/**
 * Redirect URI registered at PLK Health ID / Provider ID (fixed by the IdP,
 * so not the Auth.js default). Forward the IdP response, query string
 * unchanged, to Auth.js. A relative Location keeps the browser on the origin
 * it came in on (localhost or behind nginx), and the same-origin hop carries
 * the state / PKCE / nonce cookies. The URL carries `code` / `state`: never
 * cache it and never leak it in a Referer.
 */
export function GET(request: Request) {
  const { search } = new URL(request.url);
  return new Response(null, {
    status: 307,
    headers: {
      Location: `/api/auth/callback/${SSO_PROVIDER_ID}${search}`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
