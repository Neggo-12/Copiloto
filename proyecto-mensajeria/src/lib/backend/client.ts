/**
 * Cliente HTTP hacia el backend NestJS real (`backend/`, ver
 * `docs/decisions/ADR-0007-backend-nestjs.md` en adelante). Usa el MISMO
 * token de sesión de Supabase que ya administra `@/lib/supabase/client`
 * (mismo mecanismo de auth, `SupabaseAuthGuard` del lado del backend) — no
 * se inventa un login aparte.
 *
 * `VITE_BACKEND_URL` es opcional en desarrollo: por defecto apunta a
 * `http://localhost:3001` (el puerto real del backend, ver
 * `backend/.env.example`).
 */
import { supabase } from "@/lib/supabase/client";

export const BACKEND_BASE_URL = import.meta.env["VITE_BACKEND_URL"] ?? "http://localhost:3001";

export class BackendError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BackendError";
    this.status = status;
  }
}

/** Token de acceso actual, o null si no hay sesión — también usado para autenticar el WebSocket de `/location`. */
export async function getBackendAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getBackendAccessToken();
  if (!token) {
    throw new BackendError("No hay sesión activa — inicia sesión de nuevo.", 401);
  }

  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Error ${response.status} llamando a ${path}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      // respuesta sin cuerpo JSON — se mantiene el mensaje genérico.
    }
    throw new BackendError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const backend = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: "POST",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  patch: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: "PATCH",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: "DELETE" }),
};
