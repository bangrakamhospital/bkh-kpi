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
  /** External auditor (/access link): empty / too long access code. */
  accessCodeMissing: "access_code_missing",
  /** External auditor: no such access code. */
  accessCodeInvalid: "access_code_invalid",
  /** External auditor: the code exists but is expired or revoked. */
  accessCodeInactive: "access_code_inactive",
} as const;

export const ACCESS_CODE_MISSING_MESSAGE = "ลิงก์สำหรับผู้ตรวจภายนอกไม่ครบ";
export const ACCESS_CODE_INVALID_MESSAGE = "ลิงก์สำหรับผู้ตรวจภายนอกไม่ถูกต้อง";
export const ACCESS_CODE_INACTIVE_MESSAGE =
  "ลิงก์นี้หมดอายุหรือถูกยกเลิกแล้ว";

/** `code` values of /login?error=AccessDenied set by the SSO signIn callback. */
export const SSO_CODE = {
  orgNotAllowed: "org_not_allowed",
  /** AUTH_PLKHEALTH_ALLOWED_ORGS is empty: SSO is fail-closed. */
  orgNotConfigured: "org_not_configured",
  /** Account waits for admin approval (src/lib/users). */
  pending: "pending",
  /** Account was rejected by an admin. */
  rejected: "rejected",
  /** User store (users.json) unreadable / unwritable: fail closed. */
  userStoreUnavailable: "user_store_unavailable",
} as const;

export const ORG_NOT_ALLOWED_MESSAGE =
  "บัญชี Provider ID นี้ไม่ได้สังกัดหน่วยงานที่ได้รับอนุญาต";
export const ORG_NOT_CONFIGURED_MESSAGE =
  "ยังไม่ได้กำหนดหน่วยงานที่อนุญาตให้เข้าสู่ระบบ กรุณาติดต่อผู้ดูแลระบบ";

export const ACCOUNT_PENDING_MESSAGE =
  "บัญชีของคุณอยู่ระหว่างรอผู้ดูแลระบบอนุมัติ";
export const ACCOUNT_REJECTED_MESSAGE =
  "บัญชีของคุณไม่ได้รับอนุมัติให้ใช้งาน กรุณาติดต่อผู้ดูแลระบบ";
export const USER_STORE_UNAVAILABLE_MESSAGE =
  "ไม่สามารถตรวจสอบสิทธิ์ผู้ใช้ได้ในขณะนี้ กรุณาลองใหม่ หากยังไม่ได้ให้ติดต่อผู้ดูแลระบบ";
/** 403 of /api/admin/* for signed-in users who are not admins. */
export const ADMIN_ONLY_MESSAGE = "เฉพาะผู้ดูแลระบบเท่านั้น";

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
  switch (error) {
    case "AccessDenied":
      if (code === SSO_CODE.orgNotAllowed) return ORG_NOT_ALLOWED_MESSAGE;
      if (code === SSO_CODE.orgNotConfigured) return ORG_NOT_CONFIGURED_MESSAGE;
      if (code === SSO_CODE.pending) return ACCOUNT_PENDING_MESSAGE;
      if (code === SSO_CODE.rejected) return ACCOUNT_REJECTED_MESSAGE;
      if (code === SSO_CODE.userStoreUnavailable) {
        return USER_STORE_UNAVAILABLE_MESSAGE;
      }
      return "ไม่ได้รับอนุญาตให้เข้าสู่ระบบ";
    // Server-side problem: misconfiguration, or a stale/missing state/PKCE
    // cookie (e.g. reached the app on another origin / an old tab).
    case "Configuration":
      return "เข้าสู่ระบบไม่สำเร็จ (ระบบยังตั้งค่าไม่ครบหรือคำขอหมดอายุ) กรุณาลองใหม่ หากยังไม่ได้ให้ติดต่อผู้ดูแลระบบ";
    // The IdP answered with an error, e.g. the user cancelled.
    case "OAuthCallbackError":
      return "การเข้าสู่ระบบถูกยกเลิกหรือ Provider ID ปฏิเสธคำขอ กรุณาลองใหม่";
    case "OAuthSignInError":
      return "ไม่สามารถเชื่อมต่อ Provider ID ได้ในขณะนี้ กรุณาลองใหม่";
    case "CredentialsSignin":
      break;
    default:
      return error
        ? "เข้าสู่ระบบด้วย Provider ID ไม่สำเร็จ กรุณาลองใหม่"
        : GENERIC_LOGIN_ERROR;
  }
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
    case LOGIN_CODE.accessCodeMissing:
      return ACCESS_CODE_MISSING_MESSAGE;
    case LOGIN_CODE.accessCodeInvalid:
      return ACCESS_CODE_INVALID_MESSAGE;
    case LOGIN_CODE.accessCodeInactive:
      return ACCESS_CODE_INACTIVE_MESSAGE;
    default:
      return INVALID_CREDENTIALS_MESSAGE;
  }
}
