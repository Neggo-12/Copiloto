/**
 * Un usuario puede tener a lo sumo un vehículo de cada tipo registrado
 * (`unique(user_id, vehicle_type)` en `user_vehicles`) — modela "el cliente
 * puede tener carro y moto y andar en los dos en diferentes días/horas"
 * (decisión del fundador, ver ADR-0014).
 */
export type VehicleType = "car" | "motorcycle";

export interface UserVehicle {
  id: string;
  vehicleType: VehicleType;
  plate: string;
  nickname: string | null;
  createdAt: string;
  updatedAt: string;
}
