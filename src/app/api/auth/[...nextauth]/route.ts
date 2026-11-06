/**
 * Auth.js endpoints: /api/auth/{session,csrf,providers,signin,signout,
 * callback/credentials,...}. Configuration lives in src/auth.ts.
 */
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
