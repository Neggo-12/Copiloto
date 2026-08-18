import { useState } from "react";
import {
  BatteryHigh,
  Bluetooth,
  BluetoothConnected,
  BluetoothSlash,
  Helmet,
  Spinner,
} from "@/components/shared/icons";
import { DetailScreen } from "@/components/shared/DetailScreen";
import { SettingsSection } from "@/components/shared/SettingsList";
import { ConfirmSheet } from "@/components/shared/ConfirmSheet";
import { describeConnection, formatBattery } from "@/lib/actions/device";
import type { DeviceController } from "@/hooks/useDevice";
import { cn } from "@/lib/utils";

/** Barra de señal simulada (4 segmentos). */
function SignalBars({ level }: { level: number }) {
  return (
    <span className="flex items-end gap-0.5" aria-label={`Señal ${level} de 4`}>
      {[1, 2, 3, 4].map((bar) => (
        <span
          key={bar}
          className={cn(
            "w-1 rounded-full",
            bar <= level ? "bg-primary" : "bg-border",
            bar === 1 && "h-1.5",
            bar === 2 && "h-2.5",
            bar === 3 && "h-3.5",
            bar === 4 && "h-4.5",
          )}
        />
      ))}
    </span>
  );
}

/**
 * Subpantalla "Casco / Dispositivo": emparejamiento Bluetooth simulado.
 * TODO: reemplazar por integración real de Bluetooth LE cuando exista la placa.
 */
export function DeviceScreen({
  controller,
  onBack,
}: {
  controller: DeviceController;
  onBack: () => void;
}) {
  const { state, pairedDevice, discovered, scan, selectDevice, reconnect, disconnect, forget } =
    controller;
  const [confirmingForget, setConfirmingForget] = useState(false);

  const isScanning = state.phase === "scanning";
  const isPairing = state.phase === "pairing";
  const isConnected = state.phase === "connected";

  return (
    <DetailScreen onBack={onBack} title="Casco / Dispositivo" className="overflow-y-auto">
      <div className="pb-10">
        {isConnected && pairedDevice ? (
          /* ESTADO CONECTADO */
          <>
            <section className="px-4 pt-6">
              <div className="rounded-3xl border border-border bg-surface p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10">
                    <BluetoothConnected className="size-6 text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] font-semibold tracking-tight">
                      {pairedDevice.name}
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      {describeConnection(state)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-border bg-background px-3 py-3">
                    <p className="text-[12px] font-medium tracking-tight text-muted-foreground uppercase">
                      Batería
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 font-mono text-[20px] font-semibold">
                      <BatteryHigh className="size-5 text-accent-warm" />
                      {formatBattery(pairedDevice.batteryPercent)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background px-3 py-3">
                    <p className="text-[12px] font-medium tracking-tight text-muted-foreground uppercase">
                      Señal
                    </p>
                    <p className="mt-1 flex h-[26px] items-center">
                      <SignalBars level={pairedDevice.signalLevel} />
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-2 px-4 pt-6">
              <button
                type="button"
                onClick={disconnect}
                className="press touch-target w-full rounded-2xl border border-border bg-surface text-[16px] font-semibold tracking-tight active:bg-secondary"
              >
                Desconectar
              </button>
              <button
                type="button"
                onClick={() => setConfirmingForget(true)}
                className="press touch-target w-full rounded-2xl text-[16px] font-semibold tracking-tight text-destructive active:bg-secondary"
              >
                Olvidar dispositivo
              </button>
            </section>
          </>
        ) : (
          /* ESTADO SIN DISPOSITIVO CONECTADO / BUSCANDO / EMPAREJANDO */
          <>
            <section className="flex flex-col items-center px-8 pt-10 text-center">
              <span
                className={cn(
                  "grid size-24 place-items-center rounded-full border border-border bg-surface",
                  (isScanning || isPairing) && "pulse-warm",
                )}
              >
                {isPairing ? (
                  <Spinner className="size-10 animate-spin text-primary" />
                ) : isScanning ? (
                  <Bluetooth className="size-10 text-primary" />
                ) : pairedDevice ? (
                  <BluetoothSlash className="size-10 text-muted-foreground" />
                ) : (
                  <Helmet className="size-10 text-primary" />
                )}
              </span>

              <h2 className="mt-5 text-[20px] font-bold tracking-tight">
                {isPairing
                  ? "Emparejando…"
                  : isScanning
                    ? "Buscando…"
                    : pairedDevice
                      ? pairedDevice.name
                      : "Conecta tu casco"}
              </h2>
              <p className="mt-2 max-w-[280px] text-[15px] leading-relaxed text-muted-foreground">
                {isPairing
                  ? `Estamos dándole la mano a ${state.pairingDevice?.name ?? "tu casco"}. Tarda solo un momento.`
                  : isScanning
                    ? "Mantén el casco encendido y cerca del teléfono."
                    : pairedDevice
                      ? "Tu casco está emparejado pero desconectado. Vuelve a conectarlo cuando salgas a rodar."
                      : "Conecta tu casco para manejar CoPiloto por voz, sin sacar las manos del manubrio."}
              </p>

              {isPairing && (
                <div className="mt-6 h-1.5 w-48 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
                </div>
              )}

              {!isPairing && (
                <div className="mt-7 w-full space-y-2">
                  <button
                    type="button"
                    onClick={scan}
                    disabled={isScanning}
                    className="press touch-target w-full rounded-2xl bg-primary text-[16px] font-semibold tracking-tight text-primary-foreground disabled:opacity-50"
                  >
                    {isScanning ? "Buscando…" : "Buscar dispositivos"}
                  </button>
                  {pairedDevice && (
                    <button
                      type="button"
                      onClick={reconnect}
                      className="press touch-target w-full rounded-2xl border border-border bg-surface text-[16px] font-semibold tracking-tight active:bg-secondary"
                    >
                      Reconectar {pairedDevice.name}
                    </button>
                  )}
                </div>
              )}
            </section>

            {discovered.length > 0 && !isPairing && (
              <SettingsSection
                title="Dispositivos cerca"
                footnote="Toca un casco para emparejarlo. Esta lista es una simulación mientras llega la placa real."
              >
                {discovered.map((device) => (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => selectDevice(device.id)}
                    className="press touch-target flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-secondary"
                  >
                    <Bluetooth className="size-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[15px] font-medium tracking-tight">
                        {device.name}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-muted-foreground">
                        Batería {formatBattery(device.batteryPercent)}
                      </span>
                    </span>
                    <SignalBars level={device.signalLevel} />
                  </button>
                ))}
              </SettingsSection>
            )}

            {pairedDevice && (
              <section className="px-4 pt-6">
                <button
                  type="button"
                  onClick={() => setConfirmingForget(true)}
                  className="press touch-target w-full rounded-2xl text-[16px] font-semibold tracking-tight text-destructive active:bg-secondary"
                >
                  Olvidar dispositivo
                </button>
              </section>
            )}
          </>
        )}
      </div>

      <ConfirmSheet
        open={confirmingForget}
        title="¿Olvidar este dispositivo?"
        description="Borraremos el emparejamiento por completo. Tendrás que volver a buscar tu casco para conectarlo."
        confirmLabel="Olvidar dispositivo"
        onCancel={() => setConfirmingForget(false)}
        onConfirm={() => {
          setConfirmingForget(false);
          forget();
        }}
      />
    </DetailScreen>
  );
}
