import type { TravelMode } from "../../navigation/providers/routing-provider.interface";
import type { VehicleType } from "../../vehicles/vehicles.types";

/**
 * Traduce el Modo de manejo (ADR-0014, "¿vas en el carro o en la moto?") al
 * `TravelMode` real que espera Google Routes. Reutilizado por
 * `calculate_route` y cualquier tool futura que calcule una ruta — un solo
 * lugar decide esta traducción.
 */
export function travelModeFromDrivingMode(drivingMode: VehicleType | null): TravelMode {
  return drivingMode === "motorcycle" ? "TWO_WHEELER" : "DRIVE";
}
