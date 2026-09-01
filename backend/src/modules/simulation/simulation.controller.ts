import { Controller, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { SupabaseAuthGuard } from "../../common/guards/supabase-auth.guard";
import { SCENARIO_1_SINGLE_AMBULANCE_10_VEHICLES } from "./scenarios/scenario-1-single-ambulance-10-vehicles";
import { SCENARIO_2_SINGLE_AMBULANCE_100_VEHICLES } from "./scenarios/scenario-2-single-ambulance-100-vehicles";
import { SimulationEngineService } from "./simulation.engine";
import type { SimulationScenario } from "./simulation.types";

/** Registro de escenarios disponibles — se agrega una entrada por cada nuevo escenario de Etapa 7 (roadmap) a medida que se construyen, no todos de una vez (regla del proyecto: sin complejidad sin evidencia). */
const SCENARIOS: Record<string, SimulationScenario> = {
  [SCENARIO_1_SINGLE_AMBULANCE_10_VEHICLES.name]: SCENARIO_1_SINGLE_AMBULANCE_10_VEHICLES,
  [SCENARIO_2_SINGLE_AMBULANCE_100_VEHICLES.name]: SCENARIO_2_SINGLE_AMBULANCE_100_VEHICLES,
};

/**
 * Protegido con el mismo guard que el resto del backend — no expone datos de
 * terceros (los "vehículos" son sintéticos, IDs fijos que no corresponden a
 * ningún usuario real), pero correr un escenario sí tiene costo real
 * (múltiples escrituras a Redis), así que no queda abierto sin autenticar.
 * Sin UI todavía en `proyecto-mensajeria` — este endpoint es para
 * verificación de ingeniería/QA por ahora (ver ADR-0022), igual que
 * `GET /assistant/tools` no tiene UI propia todavía.
 */
@Controller("simulation")
@UseGuards(SupabaseAuthGuard)
export class SimulationController {
  constructor(private readonly engine: SimulationEngineService) {}

  /** Rate limit mucho más estricto que el default global (5/min en vez de 60/min): cada corrida hace múltiples escrituras reales a Redis, no es una lectura barata. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("scenarios/:name/run")
  async run(@Param("name") name: string) {
    const scenario = SCENARIOS[name];
    if (!scenario) {
      throw new NotFoundException(
        `Escenario "${name}" no existe. Disponibles: ${Object.keys(SCENARIOS).join(", ")}`,
      );
    }
    return this.engine.run(scenario);
  }
}
