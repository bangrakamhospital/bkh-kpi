/**
 * Login error codes shared by the server (Auth.js `CredentialsSignin.code`,
 * sent to the client in the `code` query parameter) and the login form.
 * Pure module: safe on client and server. Codes never reveal whether the
 * username or the password was wrong.
 */

export const LOGIN_REQUIRED_MESSAGE = "กรุณาเข้าสู่ระบบ";
export const AUTH_DISABLED_MESSAGE =
  "ระบบเข้าสู่ระบบยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ";
export const INVALID_CREDENTIALS_MESSAGE = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
export const MISSING_CREDENTIALS_MESSAGE = "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน";
export const PROVIDER_UNAVAILABLE_MESSAGE =
  "ไม่สามารถตรวจสอบบัญชีผู้ใช้ได้ในขณะนี้ กรุณาลองใหม่";
export const GENERIC_LOGIN_ERROR = "ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่";

export const LOGIN_CODE = {
  /** Auth.js default for `CredentialsSignin` (authorize returned null). */
  invalid: "credentials",
  missing: "missing_input",
  disabled: "auth_disabled",
  unavailable: "provider_unavailable",
  /** Followed by `_<minutes>`, e.g. `rate_limited_5`. */
  rateLimited: "rate_limited",
} as const;

export function rateLimitedCode(retryAfterSeconds: number): string {
  return `${LOGIN_CODE.rateLimited}_${Math.max(1, Math.ceil(retryAfterSeconds / 60))}`;
}

/**
 * Thai message for an Auth.js sign-in result (`error` / `code` from
 * `signIn(..., { redirect: false })` or the `/login?error=&code=` URL).
 */
export function loginErrorMessage(
  error: string | null | undefined,
  code: string | null | undefined,
): string {
  if (error !== "CredentialsSignin") return GENERIC_LOGIN_ERROR;
  const limited = code?.match(/^rate_limited_(\d{1,3})$/);
  if (limited) {
    return `พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณาลองใหม่ในอีก ${limited[1]} นาที`;
  }
  switch (code) {
    case LOGIN_CODE.missing:
      return MISSING_CREDENTIALS_MESSAGE;
    case LOGIN_CODE.disabled:
      return AUTH_DISABLED_MESSAGE;
    case LOGIN_CODE.unavailable:
      return PROVIDER_UNAVAILABLE_MESSAGE;
    default:
      return INVALID_CREDENTIALS_MESSAGE;
  }
}
