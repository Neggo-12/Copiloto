# Plataforma de Comunicación, Asistente y Movilidad Inteligente
## Documento de contexto consolidado — V1

**Estado:** Especificación de producto y arquitectura  
**Fecha:** 18 de agosto de 2026  
**Objetivo:** servir como contexto único para cualquier agente de desarrollo que trabaje en el proyecto.

---

# 1. Visión

El proyecto no debe tratarse como una aplicación de mensajería con un chatbot añadido.

La visión es construir una **plataforma de comunicación, asistencia personal y movilidad inteligente** en la que un usuario pueda interactuar principalmente por voz mientras conduce y, con su autorización, ejecutar acciones reales dentro del ecosistema.

La evolución prevista es:

1. Mensajería propia tipo WhatsApp.
2. Asistente de voz operativo.
3. Navegación y acciones relacionadas con ubicación.
4. Alertas de movilidad y contexto.
5. Corredor digital de emergencia para ambulancias.
6. Inteligencia predictiva de movilidad.
7. Coordinación futura con infraestructura urbana y semáforos.

La arquitectura debe permitir esta evolución sin reconstruir el producto.

---

# 2. Capacidades principales

## 2.1 Mensajería

La plataforma debe soportar una experiencia propia de mensajería:

- conversaciones 1 a 1;
- grupos;
- texto;
- imágenes;
- audio;
- video;
- documentos;
- ubicación;
- estados enviado/entregado/leído;
- respuestas;
- reacciones;
- edición/eliminación donde corresponda;
- presencia;
- escritura;
- notificaciones push;
- almacenamiento multimedia;
- búsqueda.

La plataforma es el sistema de mensajería controlado por el proyecto. No depender del envío interno mediante WhatsApp.

---

# 3. Asistente de voz

El asistente debe ser un **agente operativo**, no un chatbot.

Ejemplos:

> "Léeme el mensaje de Carlos."

> "Respóndele que llego en 20 minutos."

> "Recuérdame llamar a Pedro mañana a las diez."

> "Recuérdame comprar el cargador cuando pase por Laureles."

> "Busca esta dirección y llévame allí."

> "¿Tengo mensajes importantes?"

> "Activa emergencia."

La IA interpreta la intención y selecciona una herramienta; el backend ejecuta la acción real.

Regla fundamental:

**La IA interpreta; los servicios de la aplicación ejecutan.**

La IA jamás debe tener acceso directo a PostgreSQL, Redis o secretos.

---

# 4. Modo conducción y privacidad de voz

La aplicación **NO debe escuchar continuamente en segundo plano**.

El flujo de MVP es:

```text
Usuario abre la plataforma
        ↓
Sistema detecta que puede activar Modo conducción
        ↓
Solicita/valida permiso de ubicación
        ↓
Usuario activa Modo conducción
        ↓
Sesión de voz activa
        ↓
VAD
        ↓
Usuario habla
        ↓
Realtime / Voice Runtime
        ↓
Tool Calling
        ↓
Backend
        ↓
Resultado
        ↓
Respuesta de voz
```

La aplicación no debe prometer una wake word permanente ni escucha fuera de la sesión activa.

El usuario debe tener un control claro de:

- activar conducción;
- pausar conducción;
- terminar conducción;
- activar/desactivar voz;
- ver estado de ubicación.

La solicitud de ubicación debe hacerse de forma contextual y transparente. En iOS, Apple recomienda solicitar autorización cuando la funcionalidad que necesita ubicación va a utilizarse y permite `When In Use` como nivel preferido para usos que no requieren acceso permanente. En Android, la documentación actual también recomienda solicitar permisos en contexto y distingue ubicación foreground/background.  

---

# 5. Context Engine

El sistema debe poder combinar contexto autorizado:

```text
usuario
dispositivo
estado de conducción
vehículo
ubicación
ruta
mensajes
recordatorios
emergencias
alertas de movilidad
```

El asistente podrá entonces responder con contexto.

Ejemplo:

> "Tienes dos mensajes importantes y tráfico pesado en tu ruta."

No debe convertir cada dato de contexto en una acción automática. Debe respetar permisos y políticas.

---

# 6. Recordatorios contextuales

Esta funcionalidad forma parte del MVP.

Ejemplo:

> "Recuérdame comprar el cargador cuando pase por Laureles."

Flujo:

```text
Voice
 ↓
CREATE_LOCATION_REMINDER
 ↓
Geocode / Place lookup
 ↓
Geofence definition
 ↓
Persist reminder
 ↓
Location Engine
 ↓
Geofence triggered
 ↓
Notification / Assistant Voice
 ↓
"Recuerda comprar el cargador."
```

Debe soportar inicialmente:

- lugar;
- radio configurable;
- acción una sola vez;
- estado activo/disparado/cancelado.

---

# 7. Emergencia

El MVP principal de movilidad será:

## Emergency Corridor

Una ambulancia verificada podrá activar una emergencia.

Puede hacerlo:

- botón;
- asistente de voz.

Luego:

```text
Ambulancia
 ↓
GPS
 ↓
Destino
 ↓
Routing
 ↓
Ruta
 ↓
Emergency Corridor Engine
 ↓
Conflict Engine
 ↓
Conductores relevantes
 ↓
Alertas
```

La plataforma no debe alertar indiscriminadamente a todas las personas de un radio.

Debe determinar quién puede interferir razonablemente con la trayectoria.

---

# 8. Alertas para automóviles y motos

## Automóvil

Experiencia visual + audio.

Ejemplo:

> "Ambulancia aproximándose. Facilite el paso cuando sea seguro hacerlo."

## Motocicleta

Prioridad de voz:

> "Atención. Ambulancia aproximándose."

> "Facilite el paso cuando sea seguro."

> "La ambulancia ya pasó."

La interfaz de conducción debe minimizar la necesidad de mirar la pantalla.

---

# 9. Corredor dinámico

No usar un simple círculo de distancia.

La ruta debe convertirse en segmentos/geometría y sobre ella construir una zona dinámica.

Conceptualmente:

```text
Route
 ↓
Route Segments
 ↓
Dynamic Buffer
 ↓
Emergency Corridor
 ↓
Candidate Drivers
 ↓
Conflict Detection
```

El corredor debe poder variar según:

- velocidad;
- heading;
- segmento vial;
- tipo de vía;
- distancia;
- ETA;
- condiciones del recorrido.

---

# 10. Conflict Engine

El motor debe distinguir:

```text
NO_CONFLICT
POTENTIAL_CONFLICT
ACTIVE_CONFLICT
PASSED
```

Debe utilizar variables como:

- posición;
- heading;
- velocidad;
- distancia a ruta;
- segmento de ruta;
- ETA;
- tiempo estimado de encuentro.

Debe ser determinista, testeable y configurable.

---

# 11. Movilidad predictiva

La segunda gran capacidad será:

## Mobility Intelligence

Permitir eventos como vehículos pesados/rutas planeadas:

```text
Vehículo pesado
 ↓
Ruta
 ↓
Ventana horaria
 ↓
Impact Model
 ↓
Riesgo de congestión
 ↓
Conductores afectados
 ↓
Recomendación
```

Ejemplo:

> "Se prevé alta circulación de vehículos pesados en este corredor entre 6:00 y 7:00. Considera salir antes o utilizar una ruta alternativa."

No presentar predicciones como certezas.

---

# 12. Simulador

La simulación forma parte del producto de ingeniería desde el MVP.

Debe poder crear:

- ambulancias virtuales;
- automóviles virtuales;
- motocicletas virtuales;
- rutas;
- velocidades;
- cambios de trayectoria;
- eventos de movilidad.

Ejemplo:

```text
10 vehículos
+
1 ambulancia
+
ruta de prueba
+
intersecciones
=
simulación completa
```

Debe permitir validar:

- detección de conflictos;
- latencia;
- alertas;
- falsas alertas;
- escalamiento;
- finalización;
- consumo de recursos.

---

# 13. Futuro: semáforos

No se controla infraestructura urbana en el MVP.

La arquitectura futura será:

```text
Emergency Engine
 ↓
Priority Decision Engine
 ↓
Traffic Signal Provider
 ↓
City / Vendor Traffic Controller
 ↓
Traffic Signals
```

Antes de una integración real se utilizará un proveedor simulado.

---

# 14. Principios del producto

1. Voz cuando sea más segura que tocar.
2. Automatización controlada por permisos.
3. Ubicación solo cuando el usuario activa una funcionalidad que la necesita.
4. Alertas relevantes, no spam.
5. IA para interpretar y asistir; servicios deterministas para ejecutar.
6. Reutilizar la plataforma existente.
7. Monolito modular primero.
8. Simular antes de lanzar.
9. Medir antes de escalar.
10. Diseñar el núcleo para movilidad urbana futura.

---
