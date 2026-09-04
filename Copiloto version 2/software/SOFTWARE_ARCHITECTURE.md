# Copiloto — arquitectura de software para hardware (V1, consolidada)

Solo software: cómo el backend/app existentes deben extenderse para
hablar con el hardware (Helmet, Car Hub). Para las piezas físicas, ver
`../hardware/HARDWARE_SPEC.md`. Fuente:
`COPILOTO_2030_ARQUITECTURA_ESTRATEGICA_V1.docx` (secciones 16-18),
`COPILOTO_MASTER_SPECIFICATION_V1.docx` (sección 12) y el protocolo
propuesto en `../fuente-bruta-historica/documento completo v2 contiene todo .md`.

## 1. Principio rector

> El software existente (Vozz/Copiloto, ~60% de avance) **debe
> preservarse mediante APIs y módulos desacoplados**, no reconstruirse
> desde cero para cada dispositivo nuevo.

El hardware es un terminal manos libres adicional, no un reemplazo del
teléfono. La IA, la navegación y la conectividad siguen viviendo
principalmente en el teléfono/backend; el dispositivo (Helmet, Car Hub)
extiende esa plataforma, no la sustituye.

## 2. Capas objetivo (visión 2030)

| Capa | Responsabilidad |
| --- | --- |
| Experience | Voz, comandos, respuestas, interacción |
| AI | Intención, razonamiento, contexto, modelos multimodales |
| Safety | Accidentes, SOS, eventos críticos |
| Vision | Percepción de cámaras, objetos, escenas, eventos |
| Network | Intercom, grupos, mensajes, presencia, ubicación |
| Mobility | Navegación, rutas, vehículo, contexto |
| Cloud | Identidad, realtime, datos, almacenamiento, auditoría |
| Edge | Procesamiento local, sensores, audio, cámaras, offline |
| Devices | Helmet, Car Hub, futuros wearables |

## 3. Servicios de backend propuestos

Estos son adicionales/extensiones sobre el backend NestJS + PostgreSQL +
Redis/BullMQ + WebSocket ya existente (no un rediseño):

| Servicio | Responsabilidad |
| --- | --- |
| Identity | Usuarios, sesiones, dispositivos y permisos |
| AI Orchestrator | Intenciones, herramientas y respuestas (extiende el asistente de voz actual) |
| Realtime | WebSockets, presencia, intercom y eventos |
| Location | GPS, sesiones y geocercas (ya existe: `location-reminders`, `geofence-trigger`) |
| Safety Engine | IMU, accidentes y SOS — **nuevo** |
| Vision Events | Eventos generados por cámaras/IA — **nuevo** |
| Emergency Engine | Incidentes y escalamiento |
| Device Registry | Inventario, capacidades, firmware y estado — **nuevo**, necesario en cuanto exista hardware físico |
| Media | Clips, evidencia, metadata y retención — **nuevo** |
| Audit | Trazabilidad de acciones críticas |

## 4. Contrato común de dispositivo

Todo dispositivo (Helmet, Car Hub, futuros wearables) debe hablar el
mismo contrato con el backend, para no tener que rehacer el backend por
cada tipo de hardware:

| Campo | Ejemplo |
| --- | --- |
| `device_id` | `CP-HELMET-00001` |
| `device_type` | `helmet` |
| `firmware_version` | `1.0.0` |
| `battery` | `82%` |
| `connection` | `bluetooth` |
| `sensors` | `imu,camera,mic` |
| `capabilities` | `audio,sos,recording,intercom` |
| `last_seen` | timestamp |

### `COPILOTO DEVICE PROTOCOL` — ejemplo de evento

```json
{
  "device_id": "CP-HELMET-00001",
  "event": "imu_impact",
  "timestamp": 1780000000,
  "acceleration": 8.4,
  "gyro": { "x": 12.4, "y": 2.1, "z": 8.2 }
}
```

Al recibir esto, el backend interpreta "posible impacto detectado" y
arranca el flujo de seguridad (sección 6).

## 5. Qué vive en el dispositivo (edge) vs. en la nube

| Función | Edge | Cloud |
| --- | --- | --- |
| Grabación | Sí | Opcional |
| IMU | Sí | Solo eventos |
| Audio manos libres | Sí | No necesario |
| IA avanzada | Parcial | Sí |
| Intercom | Degradado | Sí |
| Ubicación remota | No | Sí |
| Emergencia | Preparación | Sí |
| Actualizaciones | Cliente | Gestión |

Regla dura: **las funciones críticas de seguridad no deben depender
exclusivamente de Internet**. El dispositivo debe poder detectar,
registrar y almacenar eventos localmente aunque no haya conexión.

## 6. Flujo de detección de accidente (multi-señal, nunca de un solo sensor)

```
IMU → impacto → ESP32 → Raspberry Pi (¿hay evidencia visual?)
    → Smartphone → Copiloto AI
    → "Detecté un posible accidente. ¿Estás bien?"
        ├── SÍ → registrar
        └── NO → emergencia
```

Una sola señal (solo IMU, o solo cámara) nunca debe declarar un
accidente por sí sola — hay que correlacionar cámara + IMU + GPS +
velocidad + ausencia de interacción del usuario.

## 7. Flujo "Copiloto, llama a la policía" (caso de uso prioritario)

1. Activación por voz.
2. Detección de intención + nivel de confianza.
3. Confirmación de voz cuando el escenario lo permita.
4. Identificación criptográfica de usuario/dispositivo.
5. Captura de ubicación, precisión y timestamp.
6. Creación de incidente con ID único.
7. Envío por canal seguro **autorizado**.
8. Actualización de ubicación mientras el incidente esté activo.
9. Estados: creado → recibido → en atención → cancelado/cerrado.
10. Auditoría y retención.

**Importante (legal):** la Policía Nacional publica el 123 como línea de
atención y emergencias, pero no existe ninguna API pública documentada
para recibir estos eventos automáticamente. La integración directa con
autoridades requiere un canal institucional, convenio o mecanismo
oficialmente habilitado — el producto no debe asumir que ese canal ya
existe. El MVP debe limitarse a un flujo de llamada/contactos
configurados; la integración institucional queda como fase separada del
roadmap (sección 9).

## 8. Antibroma y trazabilidad

Cuenta autenticada, dispositivo vinculado, ID único de incidente, logs
protegidos contra alteración, rate limiting, registro de
activación/cancelación, políticas de retención, acceso restringido a
información sensible.

## 9. Roadmap de software (fases relevantes del roadmap 2026-2030)

| Fase | Objetivo | Resultado |
| --- | --- | --- |
| 0 | Consolidar software existente | Copiloto funcional y probado (línea base actual) |
| 1 | P0 Audio | ESP32 + Bluetooth + micrófono + parlantes hablando con el backend actual |
| 2 | P1 Safety | IMU + SOS + eventos → nuevo Safety Engine |
| 5 | Intercom | Usuarios y grupos sobre Realtime existente |
| 6 | Vision AI | Detección de objetos y eventos → nuevo Vision Events |
| 7 | Accident Engine | Correlación multimodal |
| 8 | Emergency | Incidentes y canales autorizados |
| 9 | Car Hub | Integración sin pantalla nueva, mismo contrato de dispositivo |
| 10 | Edge AI | Mayor autonomía del dispositivo, menos dependencia de la nube |

## 10. Privacidad y seguridad (obligatorio, no opcional)

- Privacidad desde el diseño, minimización de datos.
- Consentimiento y transparencia explícitos para cámaras, audio y ubicación.
- Cifrado en tránsito y en reposo; tokens revocables; control de acceso por roles.
- Auditoría de acciones críticas; retención diferenciada de ubicación, video, audio y eventos.
- Separación entre metadata e información sensible.
- Cumplimiento de la Ley 1581 de 2012 (régimen general colombiano de protección de datos).

## 11. Próximo paso de software

En paralelo al P0 de hardware: definir el contrato de dispositivo (sección
4) como un módulo desacoplado (`Device Registry`) que el backend NestJS
actual pueda consumir sin tocar el resto de la plataforma — mismo patrón
que ya se usa para desacoplar proveedores externos (Google Maps, etc.)
detrás de adapters.
