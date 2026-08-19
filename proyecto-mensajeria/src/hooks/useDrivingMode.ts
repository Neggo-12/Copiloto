import { useCallback, useEffect, useState } from "react";
import { backend } from "@/lib/backend/client";

export type VehicleType = "car" | "motorcycle";

export interface UserVehicle {
  id: string;
  vehicleType: VehicleType;
  plate: string;
  nickname: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DrivingModeController {
  loading: boolean;
  error: string | null;
  vehicles: UserVehicle[];
  activeMode: VehicleType | null;
  refresh: () => Promise<void>;
  registerVehicle: (vehicleType: VehicleType, plate: string, nickname?: string) => Promise<void>;
  removeVehicle: (vehicleType: VehicleType) => Promise<void>;
  setMode: (vehicleType: VehicleType) => Promise<void>;
  clearMode: () => Promise<void>;
}

/** Controlador real de "Modo de manejo" — habla con `GET/POST/DELETE /vehicles` y `/vehicles/driving-mode` del backend (ver ADR-0014). */
export function useDrivingMode(): DrivingModeController {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<UserVehicle[]>([]);
  const [activeMode, setActiveMode] = useState<VehicleType | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [vehicleList, mode] = await Promise.all([
        backend.get<UserVehicle[]>("/vehicles"),
        backend.get<{ vehicleType: VehicleType | null }>("/vehicles/driving-mode"),
      ]);
      setVehicles(vehicleList);
      setActiveMode(mode.vehicleType);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el modo de manejo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const registerVehicle = useCallback(
    async (vehicleType: VehicleType, plate: string, nickname?: string) => {
      await backend.post(`/vehicles/${vehicleType}`, { plate, nickname });
      await refresh();
    },
    [refresh],
  );

  const removeVehicle = useCallback(
    async (vehicleType: VehicleType) => {
      await backend.delete(`/vehicles/${vehicleType}`);
      await refresh();
    },
    [refresh],
  );

  const setMode = useCallback(
    async (vehicleType: VehicleType) => {
      await backend.post("/vehicles/driving-mode", { vehicleType });
      await refresh();
    },
    [refresh],
  );

  const clearMode = useCallback(async () => {
    await backend.delete("/vehicles/driving-mode");
    await refresh();
  }, [refresh]);

  return {
    loading,
    error,
    vehicles,
    activeMode,
    refresh,
    registerVehicle,
    removeVehicle,
    setMode,
    clearMode,
  };
}
