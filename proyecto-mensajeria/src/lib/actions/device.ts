/**
 * Acciones aisladas del casco/dispositivo CoPiloto.
 *
 * IMPORTANTE: todo en este archivo es SIMULACIÓN. No hay Bluetooth real.
 * TODO: reemplazar por integración real de Bluetooth LE cuando exista la placa
 * y su documentación. Las firmas de estas funciones deben mantenerse para que
 * la pantalla (`DeviceScreen`) no cambie al llegar el hardware real.
 */

export type DeviceId = string;

/** Fases del flujo de emparejamiento. */
export type DeviceConnectionPhase =
  | "idle" // sin dispositivo conectado
  | "scanning" // buscando dispositivos
  | "pairing" // emparejando con el elegido
  | "connected"; // casco conectado

/** Dispositivo detectado (o ya emparejado). */
export interface HelmetDevice {
  id: DeviceId;
  name: string;
  /** Intensidad de señal simulada, 1..4. */
  signalLevel: number;
  /** Batería simulada en porcentaje 0..100. */
  batteryPercent: number;
}

export interface DeviceState {
  phase: DeviceConnectionPhase;
  /** Dispositivos encontrados en el último escaneo. */
  discovered: HelmetDevice[];
  /** Dispositivo recordado aunque esté desconectado; null si se olvidó. */
  pairedDevice: HelmetDevice | null;
  /** Dispositivo en proceso de emparejamiento. */
  pairingDevice: HelmetDevice | null;
}

export const INITIAL_DEVICE_STATE: DeviceState = {
  phase: "idle",
  discovered: [],
  pairedDevice: null,
  pairingDevice: null,
};

/** Duraciones simuladas del flujo (ms). */
export const SCAN_DURATION_MS = 2000;
export const PAIRING_DURATION_MS = 2000;

/** Catálogo de cascos de ejemplo. TODO: sustituir por resultados reales del escaneo BLE. */
export const MOCK_HELMET_DEVICES: HelmetDevice[] = [
  { id: "helmet-042", name: "CoPiloto-Casco-042", signalLevel: 4, batteryPercent: 82 },
  { id: "helmet-118", name: "CoPiloto-Casco-118", signalLevel: 3, batteryPercent: 64 },
  { id: "helmet-207", name: "CoPiloto-Casco-207", signalLevel: 2, batteryPercent: 41 },
];

/** Marca el inicio del escaneo (la lista llega después, al terminar el temporizador). */
export function startScan(state: DeviceState): DeviceState {
  return { ...state, phase: "scanning", discovered: [], pairingDevice: null };
}

/** Termina el escaneo con los dispositivos encontrados. TODO: usar el resultado real de BLE. */
export function finishScan(state: DeviceState, devices = MOCK_HELMET_DEVICES): DeviceState {
  return { ...state, phase: "idle", discovered: devices };
}

/** El usuario eligió un dispositivo: entra en emparejamiento. */
export function selectDevice(state: DeviceState, deviceId: DeviceId): DeviceState {
  const device = state.discovered.find((item) => item.id === deviceId) ?? null;
  if (!device) return state;
  return { ...state, phase: "pairing", pairingDevice: device };
}

/** Confirma el emparejamiento y deja el casco conectado. */
export function connectDevice(state: DeviceState, device?: HelmetDevice): DeviceState {
  const target = device ?? state.pairingDevice ?? state.pairedDevice;
  if (!target) return state;
  return { ...state, phase: "connected", pairedDevice: target, pairingDevice: null, discovered: [] };
}

/** Desconecta el casco pero recuerda el emparejamiento. */
export function disconnectDevice(state: DeviceState): DeviceState {
  return { ...state, phase: "idle", pairingDevice: null, discovered: [] };
}

/** Olvida el emparejamiento por completo: vuelve al estado inicial. */
export function forgetDevice(_state: DeviceState): DeviceState {
  return { ...INITIAL_DEVICE_STATE };
}

/** Etiqueta legible del nivel de batería simulado. */
export function formatBattery(batteryPercent: number): string {
  return `${Math.round(batteryPercent)}%`;
}

/** Descripción corta del estado de conexión, con voz de copiloto. */
export function describeConnection(state: DeviceState): string {
  if (state.phase === "connected") return "Conectado y listo para escucharte";
  if (state.pairedDevice) return "Emparejado · desconectado";
  return "Sin dispositivo conectado";
}
