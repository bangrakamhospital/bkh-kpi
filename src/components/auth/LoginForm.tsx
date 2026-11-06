"use client";

import { useId, useState } from "react";
import { AlertTriangle, KeyRound, Loader2, LogIn, User } from "lucide-react";
import { useAuth } from "./AuthProvider";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-surface py-2 pl-9 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 dark:border-zinc-700";
const iconCls = "h-4 w-4 shrink-0";

/**
 * Login form. Used inside the village modal and on
 * /login. The password is held only in this component's state and sent
 * once to the Auth.js credentials callback (POST /api/auth/callback/credentials).
 */
export function LoginForm({
  onSuccess,
  description,
  initialError = null,
}: {
  onSuccess: () => void;
  description?: string;
  /** E.g. from /login?error=&code= after an Auth.js redirect. */
  initialError?: string | null;
}) {
  const { login } = useAuth();
  const id = useId();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!username.trim() || !password) {
      setError("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
      return;
    }
    setPending(true);
    setError(null);
    const result = await login(username.trim(), password);
    setPending(false);
    if (result.ok) {
      setPassword("");
      onSuccess();
    } else {
      setPassword("");
      setError(result.error);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="w-full max-w-sm space-y-3"
      aria-describedby={description ? `${id}-desc` : undefined}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200">
          <LogIn aria-hidden="true" className={iconCls} />
        </span>
        <h2 className="text-base font-bold">เข้าสู่ระบบ</h2>
      </div>
      {description && (
        <p id={`${id}-desc`} className="text-xs text-zinc-700 dark:text-zinc-300">
          {description}
        </p>
      )}
      <div className="space-y-1">
        <label htmlFor={`${id}-user`} className="text-sm font-medium">
          ชื่อผู้ใช้
        </label>
        <div className="relative">
          <User
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
          />
          <input
            id={`${id}-user`}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={64}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
            required
          />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-pass`} className="text-sm font-medium">
          รหัสผ่าน
        </label>
        <div className="relative">
          <KeyRound
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
          />
          <input
            id={`${id}-pass`}
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            required
          />
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          <AlertTriangle aria-hidden="true" className={`${iconCls} mt-0.5`} />
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-60 dark:bg-brand-500 dark:text-brand-950 dark:hover:bg-brand-400"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className={`${iconCls} animate-spin`} />
        ) : (
          <LogIn aria-hidden="true" className={iconCls} />
        )}
        {pending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
