import { useCallback, useEffect, useState } from "react";
import { adminBackend } from "@/lib/backend/admin-client";
import { BackendError } from "@/lib/backend/client";

export interface AdminEmergencyVehicleRow {
  driverId: string;
  driverName: string;
  driverPhone: string;
  vehicleType: string;
  plate: string;
  organization: string | null;
  verified: boolean;
  active: boolean;
  verifiedAt: string | null;
}

export interface AssignAmbulanceForm {
  phone: string;
  phoneCountryCode: string;
  plate: string;
  organization?: string;
}

/** Forma real que devuelve `GET /emergency/admin/incidents` (ver `EmergencyIncidentsService.mapRow`). */
export interface AdminEmergencyIncidentRow {
  id: string;
  userId: string;
  type: "policia";
  status: "creado" | "recibido" | "en_atencion" | "cancelado" | "cerrado";
  confidenceLevel: "alta" | "media" | "baja";
  latitude: number;
  longitude: number;
  locationAccuracyMeters: number | null;
  device: string;
  snapshotDisplayName: string;
  snapshotPhone: string | null;
  snapshotEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AdminAccess = "checking" | "denied" | "granted";

/**
 * Panel de administrador real (2026-09-01, ver `ADR-0006`/`emergency-admin.controller.ts`;
 * extendido 2026-09-03 con incidentes de "llamar a la policía", ver decisión
 * (34)/(35) en docs/decisions/README.md). La autorización real vive SIEMPRE
 * en el backend (`AdminGuard`) — este hook nunca decide por su cuenta quién
 * es administrador, solo refleja lo que el backend responde (403 real = no
 * admin).
 *
 * Usa `adminBackend` (sesión separada de `/admin`, ver
 * `@/lib/backend/admin-client.ts`) a propósito — desde 2026-09-03 este hook
 * es exclusivo del dashboard de administrador (`/admin`), ya NO vive dentro
 * de la navegación de la app normal (ver decisión (35): la pestaña "Admin"
 * que aparecía en todas las cuentas se quitó de ahí).
 */
export function useEmergencyAdmin() {
  const [access, setAccess] = useState<AdminAccess>("checking");
  const [vehicles, setVehicles] = useState<AdminEmergencyVehicleRow[]>([]);
  const [incidents, setIncidents] = useState<AdminEmergencyIncidentRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [vehiclesData, incidentsData] = await Promise.all([
        adminBackend.get<AdminEmergencyVehicleRow[]>("/emergency/admin/vehicles"),
        adminBackend.get<AdminEmergencyIncidentRow[]>("/emergency/admin/incidents"),
      ]);
      setVehicles(vehiclesData);
      setIncidents(incidentsData);
      setAccess("granted");
      setError(null);
    } catch (err) {
      if (err instanceof BackendError && err.status === 403) {
        setAccess("denied");
      } else {
        setAccess("denied");
        setError(err instanceof Error ? err.message : "No se pudo cargar el panel.");
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Auto-refresco cada 15s mientras la pestaña de admin esté abierta — antes
   * el panel solo cargaba una vez al entrar, así que un incidente real nuevo
   * (ej. un SOS de policía) no aparecía hasta recargar la página a mano. No
   * es tiempo real (no hay socket propio del admin todavía), pero es
   * suficiente para no depender de que el fundador recuerde recargar en
   * medio de una emergencia real.
   */
  useEffect(() => {
    const interval = setInterval(() => {
      void refresh();
    }, 15_000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function assign(
    form: AssignAmbulanceForm,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      const result = await adminBackend.post<{
        assigned: boolean;
        error?: "driver_not_found";
      }>("/emergency/admin/vehicles", form);
      if (!result.assigned) {
        return {
          ok: false,
          message: "No existe ningún usuario registrado con ese teléfono todavía.",
        };
      }
      await refresh();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "No se pudo asignar.",
      };
    }
  }

  async function setActive(driverId: string, active: boolean): Promise<void> {
    await adminBackend.patch(`/emergency/admin/vehicles/${driverId}`, { active });
    await refresh();
  }

  async function setIncidentStatus(
    id: string,
    status: Exclude<AdminEmergencyIncidentRow["status"], "creado">,
  ): Promise<void> {
    await adminBackend.patch(`/emergency/admin/incidents/${id}`, { status });
    await refresh();
  }

  return { access, vehicles, incidents, error, assign, setActive, setIncidentStatus, refresh };
}
