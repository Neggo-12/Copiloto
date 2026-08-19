/**
 * Tipo geográfico compartido — antes vivía duplicado dentro de
 * `routing-provider.interface.ts`; se centraliza aquí porque ahora lo
 * consumen también `route-session` y el cálculo de desvío de ruta, y no
 * tiene sentido que un concepto tan básico dependa del módulo de navegación.
 */
export interface LatLng {
  latitude: number;
  longitude: number;
}
