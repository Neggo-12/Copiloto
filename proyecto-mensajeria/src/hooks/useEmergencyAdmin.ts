import { useCallback, useEffect, useState } from "react";
import { backend, BackendError } from "@/lib/backend/client";

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

export type AdminAccess = "checking" | "denied" | "granted";

/**
 * Panel de administrador real (2026-09-01, ver `ADR-0006`/`emergency-admin.controller.ts`):
 * antes de esto, verificar una ambulancia solo se podía hacer por SQL/MCP
 * directo. La autorización real vive SIEMPRE en el backend (`AdminGuard`) —
 * este hook nunca decide por su cuenta quién es administrador, solo refleja
 * lo que el backend responde (403 real = no admin, mismo patrón ya usado
 * por `ambulanceView` en `useCopilotoRealtime`).
 */
export function useEmergencyAdmin() {
  const [access, setAccess] = useState<AdminAccess>("checking");
  const [vehicles, setVehicles] = useState<AdminEmergencyVehicleRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await backend.get<AdminEmergencyVehicleRow[]>("/emergency/admin/vehicles");
      setVehicles(data);
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

  async function assign(
    form: AssignAmbulanceForm,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      const result = await backend.post<{
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
    await backend.patch(`/emergency/admin/vehicles/${driverId}`, { active });
    await refresh();
  }

  return { access, vehicles, error, assign, setActive, refresh };
}
