/**
 * Dashboard auth API (FastAPI). Uses NEXT_PUBLIC_API_URL.
 */

import { API_BASE_URL } from "./api";
import { authHeaderRecord, setAccessToken } from "./auth-token";

const MSG_SERVICE_UNAVAILABLE =
  "This service isn’t available right now. Please try again later or contact your administrator.";

const MSG_NETWORK = "We couldn’t reach the server. Check your connection and try again.";

function parseFastApiDetail(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const raw = (data as { detail?: unknown }).detail;
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          const m = (item as { msg?: unknown }).msg;
          return typeof m === "string" ? m.trim() : "";
        }
        return typeof item === "string" ? item : "";
      })
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function userFacingAuthMessage(detail: string, status: number, kind: "login" | "register" | "session"): string {
  const d = detail.trim();
  const dl = d.toLowerCase();

  if (
    d.includes("JWT_SECRET") ||
    dl.includes("jwt_secret") ||
    dl.includes("login unavailable") ||
    dl.includes("registration unavailable") ||
    d.includes("PostgreSQL not configured") ||
    dl.includes("postgresql not configured")
  ) {
    return MSG_SERVICE_UNAVAILABLE;
  }

  if (status === 503 || status === 502) return MSG_SERVICE_UNAVAILABLE;

  if (status === 422)
    return kind === "register"
      ? "Please check your information and try again."
      : "Something was wrong with your request. Please try again.";

  if (status === 403 && kind === "login") {
    if (dl.includes("pending activation") || d === "Account pending activation") {
      return "Your account is still waiting for administrator approval. You can sign in once a super admin activates it.";
    }
    if (dl.includes("access denied") || d === "Account access denied") {
      return "This account is not active. Contact your administrator if you need help.";
    }
    return "You can’t sign in with this account right now.";
  }

  if (!d) {
    if (status === 401 && kind === "login") return "The email or password you entered doesn’t match our records.";
    if (status === 401 && kind === "session") return "Your session has ended. Please sign in again.";
    if (kind === "register") return "We couldn’t create your account. Please try again.";
    return "Something went wrong. Please try again.";
  }

  if (d === "Invalid email or password") return "The email or password you entered doesn’t match our records.";

  if (dl.includes("already exists")) return "An account with this email already exists. Try signing in instead.";

  if (d === "Authentication required" || d === "Not authenticated")
    return "Your session has ended. Please sign in again.";

  if (kind === "register" && (status === 400 || status >= 500))
    return "We couldn’t create your account. Please try again.";

  if (kind === "login" && status >= 500) return MSG_SERVICE_UNAVAILABLE;

  return d;
}

export type UserPublic = {
  id: number;
  email: string;
  full_name: string;
  country: string;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function authLogin(email: string, password: string): Promise<{ access_token: string }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });
  } catch {
    throw new Error(MSG_NETWORK);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(userFacingAuthMessage(parseFastApiDetail(data), res.status, "login"));
  const tok = (data as { access_token?: string }).access_token;
  if (!tok) throw new Error("We couldn’t complete sign-in. Please try again.");
  setAccessToken(tok);
  return { access_token: tok };
}

export async function authRegister(payload: {
  email: string;
  full_name: string;
  country: string;
  password: string;
}): Promise<UserPublic> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(MSG_NETWORK);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(userFacingAuthMessage(parseFastApiDetail(data), res.status, "register"));
  return data as UserPublic;
}

export async function authMe(): Promise<UserPublic> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { ...authHeaderRecord() },
      cache: "no-store",
    });
  } catch {
    throw new Error(MSG_NETWORK);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(userFacingAuthMessage(parseFastApiDetail(data), res.status, "session"));
  return data as UserPublic;
}

export function authLogout(): void {
  setAccessToken(null);
}

export function isStaffRole(role: string): boolean {
  return role === "admin" || role === "super_admin";
}

/** Active dashboard users who may access admin UI (manage users, query log, etc.). */
export function userHasStaffAccess(user: UserPublic | null | undefined): boolean {
  return !!user && user.status === "active" && isStaffRole(user.role);
}

export function userHasSuperAdminAccess(user: UserPublic | null | undefined): boolean {
  return !!user && user.status === "active" && user.role === "super_admin";
}
