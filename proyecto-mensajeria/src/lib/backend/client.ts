/**
 * Cliente HTTP hacia el backend NestJS real (`backend/`, ver
 * `docs/decisions/ADR-0007-backend-nestjs.md` en adelante). Usa el MISMO
 * mecanismo de auth del lado del backend (`SupabaseAuthGuard`, JWT de
 * Supabase Auth) para cualquier cliente de Supabase que se le pase — no se
 * inventa un protocolo de auth aparte.
 *
 * `createBackendClient()` es una fábrica a propósito (no un objeto único
 * `backend` como antes, 2026-09-03): el panel de administrador (`/admin`,
 * ver `@/lib/backend/admin-client.ts`) necesita las MISMAS llamadas
 * `GET`/`POST`/`PATCH` pero autenticadas con la sesión de
 * `@/lib/supabase/admin-client` (separada a propósito de la sesión de la app
 * normal, ver el comentario largo en ese archivo) — reusar esta fábrica
 * evita duplicar la lógica real de fetch/errores en dos archivos.
 *
 * `VITE_BACKEND_URL` es opcional en desarrollo: por defecto apunta a
 * `http://localhost:3001` (el puerto real del backend, ver
 * `backend/.env.example`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
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

export interface BackendClient {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  patch: <T>(path: string, body?: unknown) => Promise<T>;
  delete: <T>(path: string) => Promise<T>;
}

/** Fábrica real: crea un cliente de backend atado a la sesión de UN cliente de Supabase específico. */
export function createBackendClient(authClient: SupabaseClient): BackendClient {
  async function getAccessToken(): Promise<string | null> {
    const { data } = await authClient.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await getAccessToken();
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

  return {
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
}

/** Token de acceso actual, o null si no hay sesión — también usado para autenticar el WebSocket de `/location`. */
export async function getBackendAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Cliente de backend real de la app normal (mensajería/copiloto) — mismo objeto de siempre, sin cambio de comportamiento. */
export const backend = createBackendClient(supabase);
