-- Habilita PostGIS: requerido para Location/Navigation/Emergency Corridor
-- (geometría de ruta, buffer dinámico del corredor, geofencing de recordatorios
-- por ubicación). Ver docs/decisions/05_CRONOGRAMA_EMERGENCY_Y_NUEVAS_FUNCIONALIDADES.md
-- Fase 1, y docs/operations/03_HERRAMIENTAS_URLS_Y_REFERENCIAS.md §8.
create extension if not exists postgis with schema extensions;
