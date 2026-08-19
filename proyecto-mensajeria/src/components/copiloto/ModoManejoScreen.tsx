import { useState } from "react";
import type { ReactNode } from "react";
import { PhoneScreen } from "@/components/shared/PhoneScreen";
import { Button } from "@/components/ui/button";
import { Car, Helmet, Plus, Spinner, Trash2 } from "@/components/shared/icons";
import type { DrivingModeController, VehicleType } from "@/hooks/useDrivingMode";

const VEHICLE_META: Record<VehicleType, { label: string; icon: typeof Car }> = {
  car: { label: "Carro", icon: Car },
  motorcycle: { label: "Moto", icon: Helmet },
};

/** Pantalla real de "Modo de manejo" — datos y acciones reales contra `GET/POST /vehicles*` (ADR-0014). */
export function ModoManejoScreen({
  controller,
  tabBar,
  subNav,
}: {
  controller: DrivingModeController;
  tabBar: ReactNode;
  subNav?: ReactNode;
}) {
  const {
    loading,
    error,
    vehicles,
    activeMode,
    registerVehicle,
    removeVehicle,
    setMode,
    clearMode,
  } = controller;
  const [addingType, setAddingType] = useState<VehicleType | null>(null);
  const [plateDraft, setPlateDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const vehicleByType = new Map(vehicles.map((v) => [v.vehicleType, v]));

  async function handleRegister(vehicleType: VehicleType) {
    if (!plateDraft.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await registerVehicle(vehicleType, plateDraft.trim());
      setAddingType(null);
      setPlateDraft("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo registrar el vehículo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetMode(vehicleType: VehicleType) {
    setBusy(true);
    setActionError(null);
    try {
      if (activeMode === vehicleType) {
        await clearMode();
      } else {
        await setMode(vehicleType);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo cambiar el modo de manejo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PhoneScreen title="Modo de manejo" showThemeToggle className="justify-between">
      {subNav}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
        <p className="text-[14px] text-muted-foreground">
          Elige con qué vehículo vas ahora mismo — cambia cuando quieras, tantas veces como uses
          carro y moto.
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-[14px] text-muted-foreground">
            <Spinner className="size-4 animate-spin" /> Cargando...
          </div>
        )}
        {error && (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}
        {actionError && (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {actionError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(VEHICLE_META) as VehicleType[]).map((vehicleType) => {
            const meta = VEHICLE_META[vehicleType];
            const Icon = meta.icon;
            const vehicle = vehicleByType.get(vehicleType);
            const isActive = activeMode === vehicleType;

            return (
              <div
                key={vehicleType}
                className={`rounded-2xl border p-4 ${isActive ? "border-primary bg-primary/10" : "border-border bg-card"}`}
              >
                <Icon className={`size-8 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                <p className="mt-2 text-[15px] font-semibold">{meta.label}</p>
                {vehicle ? (
                  <>
                    <p className="text-[13px] text-muted-foreground">{vehicle.plate}</p>
                    <div className="mt-3 flex flex-col gap-2">
                      <Button
                        size="sm"
                        variant={isActive ? "default" : "outline"}
                        disabled={busy}
                        onClick={() => void handleSetMode(vehicleType)}
                      >
                        {isActive ? "Usando ahora" : "Usar este"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void removeVehicle(vehicleType).catch((err: unknown) =>
                            setActionError(
                              err instanceof Error ? err.message : "No se pudo quitar.",
                            ),
                          )
                        }
                      >
                        <Trash2 className="size-4" /> Quitar
                      </Button>
                    </div>
                  </>
                ) : addingType === vehicleType ? (
                  <div className="mt-3 space-y-2">
                    <input
                      value={plateDraft}
                      onChange={(event) => setPlateDraft(event.target.value.toUpperCase())}
                      placeholder="Placa"
                      className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-[14px] outline-none"
                    />
                    <Button
                      size="sm"
                      disabled={busy || !plateDraft.trim()}
                      onClick={() => void handleRegister(vehicleType)}
                    >
                      Guardar
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => setAddingType(vehicleType)}
                  >
                    <Plus className="size-4" /> Registrar
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {tabBar}
    </PhoneScreen>
  );
}
