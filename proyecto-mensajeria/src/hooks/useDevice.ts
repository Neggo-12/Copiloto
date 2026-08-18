import { useCallback, useEffect, useRef, useState } from "react";
import * as deviceActions from "@/lib/actions/device";
import type { DeviceId, DeviceState, HelmetDevice } from "@/lib/actions/device";

export interface DeviceController {
  state: DeviceState;
  pairedDevice: HelmetDevice | null;
  discovered: HelmetDevice[];
  scan: () => void;
  selectDevice: (deviceId: DeviceId) => void;
  reconnect: () => void;
  disconnect: () => void;
  forget: () => void;
}

/**
 * Controlador del casco/dispositivo. Los temporizadores simulan el escaneo y el
 * emparejamiento Bluetooth.
 * TODO: reemplazar por integración real de Bluetooth LE cuando exista la placa.
 */
export function useDevice(): DeviceController {
  const [state, setState] = useState<DeviceState>(deviceActions.INITIAL_DEVICE_STATE);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const scan = useCallback(() => {
    setState(deviceActions.startScan);
    later(() => setState((prev) => deviceActions.finishScan(prev)), deviceActions.SCAN_DURATION_MS);
  }, [later]);

  const selectDevice = useCallback(
    (deviceId: DeviceId) => {
      setState((prev) => deviceActions.selectDevice(prev, deviceId));
      later(
        () => setState((prev) => deviceActions.connectDevice(prev)),
        deviceActions.PAIRING_DURATION_MS,
      );
    },
    [later],
  );

  const reconnect = useCallback(() => {
    setState((prev) => ({ ...prev, phase: "pairing", pairingDevice: prev.pairedDevice }));
    later(
      () => setState((prev) => deviceActions.connectDevice(prev)),
      deviceActions.PAIRING_DURATION_MS,
    );
  }, [later]);

  const disconnect = useCallback(() => setState(deviceActions.disconnectDevice), []);
  const forget = useCallback(() => setState(deviceActions.forgetDevice), []);

  return {
    state,
    pairedDevice: state.pairedDevice,
    discovered: state.discovered,
    scan,
    selectDevice,
    reconnect,
    disconnect,
    forget,
  };
}
