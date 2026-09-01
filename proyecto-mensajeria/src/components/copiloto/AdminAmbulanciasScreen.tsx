import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { PhoneScreen } from "@/components/shared/PhoneScreen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "@/components/shared/icons";
import { useEmergencyAdmin } from "@/hooks/useEmergencyAdmin";

/**
 * Panel real de administrador (2026-09-01, a pedido explícito del
 * fundador): asignar qué vehículo es ambulancia verificada. Antes de esto
 * la única forma real de hacerlo era SQL/MCP directo (ver ADR-0006). La
 * autorización real vive en el backend (`AdminGuard`, `ADMIN_USER_ID`) —
 * esta pantalla no decide nada, solo refleja lo que el backend permite:
 * cualquier usuario que no sea el administrador ve "Sin acceso" real (403
 * real del servidor), nunca un error genérico que sugiera que es un bug.
 */
export function AdminAmbulanciasScreen({
  tabBar,
  subNav,
}: {
  tabBar: ReactNode;
  subNav?: ReactNode;
}) {
  const { access, vehicles, error, assign, setActive } = useEmergencyAdmin();
  const [phone, setPhone] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("CO");
  const [plate, setPlate] = useState("");
  const [organization, setOrganization] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting || !phone || !plate) return;
    setSubmitting(true);
    setFormError(null);
    setFormSuccess(null);
    const result = await assign({
      phone: phone.startsWith("+") ? phone : `+${phone}`,
      phoneCountryCode,
      plate,
      ...(organization ? { organization } : {}),
    });
    setSubmitting(false);
    if (result.ok) {
      setFormSuccess("Ambulancia verificada y asignada.");
      setPhone("");
      setPlate("");
      setOrganization("");
    } else {
      setFormError(result.message);
    }
  }

  return (
    <PhoneScreen
      title="Admin · Ambulancias"
      showThemeToggle
      className="justify-between"
    >
      {subNav}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
        {access === "checking" && (
          <p className="text-[13px] text-muted-foreground">
            Verificando acceso...
          </p>
        )}

        {access === "denied" && (
          <p className="rounded-xl bg-muted px-3 py-2 text-[13px] text-muted-foreground">
            Sin acceso — solo el administrador puede ver esta pantalla.
            {error && ` (${error})`}
          </p>
        )}

        {access === "granted" && (
          <>
            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="space-y-2 rounded-2xl border border-border bg-card p-3"
            >
              <p className="text-[14px] font-medium">
                Verificar nueva ambulancia
              </p>
              <div className="flex gap-2">
                <div className="w-20 space-y-1">
                  <Label htmlFor="admin-cc" className="text-[12px]">
                    País
                  </Label>
                  <Input
                    id="admin-cc"
                    value={phoneCountryCode}
                    onChange={(e) =>
                      setPhoneCountryCode(e.target.value.toUpperCase())
                    }
                    maxLength={2}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor="admin-phone" className="text-[12px]">
                    Teléfono (con +código)
                  </Label>
                  <Input
                    id="admin-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+573001234567"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="admin-plate" className="text-[12px]">
                  Placa
                </Label>
                <Input
                  id="admin-plate"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  placeholder="ABC123"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="admin-org" className="text-[12px]">
                  Organización (opcional)
                </Label>
                <Input
                  id="admin-org"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="Cruz Roja, hospital, particular..."
                />
              </div>
              {formError && (
                <p className="text-[13px] text-destructive">{formError}</p>
              )}
              {formSuccess && (
                <p className="text-[13px] text-emerald-600 dark:text-emerald-400">
                  {formSuccess}
                </p>
              )}
              <Button
                type="submit"
                disabled={submitting || !phone || !plate}
                className="w-full"
              >
                {submitting ? "Verificando..." : "Verificar y asignar"}
              </Button>
            </form>

            <div className="space-y-2">
              <p className="text-[14px] font-medium">
                Ambulancias asignadas ({vehicles.length})
              </p>
              {vehicles.length === 0 && (
                <p className="rounded-xl bg-muted px-3 py-2 text-[13px] text-muted-foreground">
                  Ninguna ambulancia asignada todavía.
                </p>
              )}
              {vehicles.map((vehicle) => (
                <div
                  key={vehicle.driverId}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[13px] font-medium">
                      <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                      {vehicle.driverName}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {vehicle.plate} · {vehicle.driverPhone}
                      {vehicle.organization && ` · ${vehicle.organization}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={vehicle.active ? "secondary" : "outline"}>
                      {vehicle.active ? "Activa" : "Inactiva"}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void setActive(vehicle.driverId, !vehicle.active)
                      }
                    >
                      {vehicle.active ? "Desactivar" : "Reactivar"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {tabBar}
    </PhoneScreen>
  );
}
