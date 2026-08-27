# ADR-0027 — Activación general del asistente + verificación de quién habla (diseño, sin código todavía)

**Fecha:** 2026-08-19 (actualizado el mismo día — ver "Cambio de alcance")
**Estado:** Propuesto — diseño únicamente. Ningún código de este ADR se
implementó en esta sesión; ver "Bloqueo encontrado" abajo para el motivo.

## Cambio de alcance (2026-08-19, mismo día)

El fundador pidió explícitamente **suspender la personalización por nombre**
("Estefa") por ahora, para no quedarse trabado en esa decisión, y dejar la
activación como algo GENERAL (cualquier palabra clave fija, no una por
cliente). A cambio, el pedido real que quiere resolver es distinto y más
importante: que el sistema pueda **identificar quién está hablando**, para
que una acción como "envía este mensaje" solo se ejecute si es de verdad el
dueño de la cuenta hablando — no un pasajero, no un tercero, no ruido de
fondo o alguien hablando fuerte cerca. Este ADR se actualiza para reflejar
eso: la sección de nombre personalizado queda documentada pero fuera de
alcance por ahora; se agrega una sección nueva de verificación de hablante
(abajo, "Identificación de quién habla").

## Contexto (pedido original, para referencia)

Pedido original del fundador: que cada cliente pueda ponerle un nombre
personalizado a su asistente (ej. "Estefa") y que el sistema lo reconozca
automáticamente al decirlo, análogo a "Oye Siri" — sin necesidad de tocar un
botón para activar la sesión de voz.

Este pedido eran en realidad **dos problemas de tamaño muy distinto**:

1. **Nombre personalizado** — un campo de texto en Ajustes. Trivial en
   principio. **Suspendido por el fundador, ver arriba.**
2. **Activación automática por palabra clave (wake word)** — un problema
   técnico real y no trivial: requiere que el dispositivo escuche audio de
   forma continua y detecte una palabra específica SIN mandar audio
   constantemente a un servidor (costoso, consume batería, y viola la regla
   de seguridad del proyecto: "No escuchar en segundo plano
   continuamente... voz solo durante una sesión explícita de Modo
   conducción/voz activa"). **Se mantiene, pero con una palabra genérica
   fija (ej. "Copiloto") en vez de una por cliente — más simple y evita el
   problema nuevo de tener que entrenar/gestionar una palabra distinta por
   usuario.**

## Bloqueo encontrado (Discover) — por qué no se construyó ni el campo simple hoy

Antes de tocar código, se auditó `ProfileScreen.tsx` → `useProfile.ts` →
`updateProfile`, el mecanismo existente donde viviría naturalmente un campo
de "nombre del asistente" (junto a "Editar perfil": nombre, foto, "acerca
de"). Hallazgo: **`updateProfile` en `useProfile.ts` no habla con Supabase
en absoluto** — es una actualización 100% local (`updateCurrentUser`, estado
en memoria vía `AppStore`). El nombre/foto/"acerca de" que el usuario edita
en Ajustes se ve reflejado en la sesión actual pero **nunca se guarda en la
fila real de `profiles`** — se pierde al recargar o cerrar sesión.

Esto es un gap preexistente, independiente de este pedido (no lo introdujo
esta sesión), pero significa que agregar un campo nuevo (`assistant_name`)
sobre ese mismo mecanismo habría producido exactamente el tipo de cosa que
la regla del proyecto prohíbe ("no quiero nada de simulación"): un campo que
se ve funcionando en la pantalla pero que no persiste de verdad. Construirlo
bien requiere primero conectar `updateProfile` a un
`UPDATE public.profiles ... where id = auth.uid()` real — un cambio
correcto y necesario, pero que pertenece a su propio slice (toca el
mecanismo general de edición de perfil, no solo el campo nuevo), siguiendo
la regla de no tocar áreas no relacionadas sin necesidad clara. Se
documenta aquí como prerequisito explícito, no se resuelve en este ADR.

## Diseño propuesto — nombre personalizado (SUSPENDIDO por el fundador, 2026-08-19 — se deja documentado por si se retoma)

- Columna nueva `profiles.assistant_name` (text, nullable, default `NULL` →
  el frontend usa un nombre por defecto genérico si no está seteado).
- Se agrega al mismo formulario de "Editar perfil" (o a una fila nueva
  dentro de `SettingsSection title="Ajustes"`) una vez que `updateProfile`
  ya escriba de verdad en `profiles`.
- El backend (`AssistantModule`, ADR-0016) lee `assistant_name` al construir
  el prompt/contexto de la sesión de voz, para que el asistente responda
  reconociendo su propio nombre en la conversación (ej. "Estefa, ¿qué
  necesitas?").
- Sin dependencia de la API de voz todavía sin provisionar — es un dato de
  personalización, no requiere Realtime/STT para existir.

## Diseño propuesto — activación automática por wake word

**Esto es un requisito técnico nuevo, distinto y más grande que "poner un
nombre"** — no es una extensión trivial del campo de texto.

### Por qué no se puede resolver solo con la API de voz que ya está bloqueada

La integración Realtime/STT pendiente (ADR-0016, bloqueada por la key del
fundador) asume que la sesión de voz YA está activa cuando le llega audio —
no incluye detección de palabra clave en reposo. Mandar audio continuo a un
servicio en la nube solo para detectar si alguien dijo "Estefa" sería:
(a) costoso (streaming constante, no solo durante una sesión activa),
(b) un consumo de batería alto, y (c) va directamente contra la regla de
seguridad ya escrita del proyecto de no escuchar en segundo plano de forma
continua.

### Enfoque recomendado: motor de wake word on-device, ligero, previo a la API de voz

1. Un modelo pequeño de "keyword spotting" corriendo LOCALMENTE en el
   dispositivo (no en el servidor), que solo escucha para reconocer la
   palabra clave — nunca transcribe ni manda audio a ningún lado mientras
   está en este modo pasivo.
2. Opciones reales de motor (a evaluar con el fundador, ninguna
   seleccionada todavía): **Picovoice Porcupine** (wake word personalizado
   real, SDK con soporte Android/Web, plan gratuito limitado + plan pago
   para producción) es la opción más madura para un nombre verdaderamente
   personalizado por usuario (cada cliente entrena o genera su propia
   palabra, ej. "Estefa"); alternativas open-source como `openWakeWord`
   existen pero con menor soporte oficial para Android/producción. Esto
   requiere que el fundador evalúe/contrate un proveedor, mismo tipo de
   paso ya hecho para Google Maps Platform (ADR-0010) — no es una decisión
   que este backend pueda tomar solo.
3. Solo DESPUÉS de que el motor local detecta la palabra clave, se activa
   la sesión de voz real (Realtime/STT) — exactamente el mismo punto de
   entrada que ya existe para "tocar el botón de micrófono", solo que
   disparado por voz en vez de por gesto. El resto del flujo (Tool
   Registry, autorización, confirmación) no cambia — ADR-0016 ya lo cubre.
4. El motor de wake word solo corre mientras "Modo conducción/voz activa"
   esté explícitamente encendido (mismo estado ya modelado en
   `DrivingModeService`, ADR-0014) — nunca en segundo plano permanente sin
   que el usuario lo haya activado, cumpliendo la regla de seguridad del
   proyecto tal cual está escrita.

### Dependencias reales, en orden

1. Prerequisito de persistencia de perfil (arriba) — desbloquea el campo de
   nombre.
2. Decisión del fundador sobre proveedor de wake word (Picovoice u otro) —
   mismo tipo de paso que la API de voz y que Google Maps.
3. La API de voz Realtime/STT (ya bloqueada, sin cambios de este ADR).
4. Implementación real: nombre (rápido, una vez resuelto el prerequisito) y
   wake word (más largo — nuevo SDK, nuevo permiso de micrófono en segundo
   plano solo durante Modo conducción, prueba real en dispositivo Android).

## Precios reales de proveedores de wake word (agregado 2026-08-19, a pedido del fundador)

Investigado vía búsqueda web el 2026-08-19 — Picovoice no publica su tabla de
precios completa como página estática (requiere JS), así que estos números
vienen de un agregador de terceros (`saasworthy.com`) y deben confirmarse
directamente en `picovoice.ai/pricing` antes de comprometerse a un plan:

| Opción | Costo | Límite real | Notas |
|---|---|---|---|
| **Picovoice — Plan gratuito** | $0 | **1 usuario activo al mes** (wake word) | Sirve para que el fundador pruebe la idea él solo; no alcanza ni para el grupo de amigos de prueba. |
| **Picovoice — Plan Foundation** | ~$6,000/año | 100 usuarios activos al mes | Incluye soporte por correo (6h, SLA 3 días hábiles). Salto grande de precio apenas se pasa de 1 usuario. |
| **Picovoice — Plan Enterprise** | ~$30,000/año | Igual asignación que Foundation | Soporte dedicado, SLA a la medida, términos comerciales personalizados. |
| **openWakeWord (open source, gratis)** | $0, sin costo por usuario | Sin límite de usuarios (se aloja/corre uno mismo) | Gratis y sin límite de usuarios, pero SIN soporte oficial de Picovoice: el soporte Android depende de puertos hechos por la comunidad (ej. `openwakeword-android-kt`), no de un SDK oficial pulido — más trabajo de integración y menos garantía de calidad "lista para producción" que Picovoice. |

**Lectura honesta para esta etapa:** con la plataforma todavía en pruebas con
un grupo cerrado de amigos (no cientos de usuarios activos), el plan
gratuito de Picovoice (1 usuario) no alcanza para probarlo con el grupo, y
saltar directo a $6,000/año antes de validar si el wake word realmente se
usa/sirve es un gasto grande y temprano. `openWakeWord` es la opción sin
costo para validar la idea con el grupo de prueba primero, a cambio de más
trabajo de integración de nuestro lado (sin SDK oficial de Android). Una
ruta razonable: validar con `openWakeWord` en la fase de prueba con amigos,
y solo pasar a Picovoice pago si el proyecto escala a más usuarios y se
justifica el soporte oficial. Decisión final del fundador, no tomada en este
ADR.

## Detección inteligente de "¿sigue manejando?" (agregado 2026-08-19, a pedido del fundador)

El fundador señaló un caso real: iba a 50 km/h (claramente manejando), bajó a
5-10 km/h (¿tráfico? ¿se está deteniendo?), y podría terminar detenido
comiendo o en una reunión — momentos en los que NO se quiere que el
asistente siga escuchando activamente por la palabra clave, aunque "Modo
conducción" siga técnicamente encendido.

**Esto es una extensión natural, no un problema nuevo separado** — el
sistema YA calcula velocidad real de GPS punto a punto (`LocationGateway`/
`location-normalizer.ts`, ADR-0009, la misma velocidad que ya usa el buffer
dinámico del corredor de emergencia en ADR-0021). El wake word no necesita
un sensor nuevo, solo una regla sobre un dato que ya existe:

- **Mientras la velocidad reciente esté por encima de un umbral bajo** (ej.
  >8-10 km/h sostenido) → el wake word sigue activo, asumiendo que se está
  manejando (incluye ir despacio en tráfico real).
- **Si la velocidad cae por debajo del umbral y se mantiene así por un
  tiempo** (ej. 2-3 minutos seguidos, no un semáforo de 30 segundos — el
  tiempo exacto es un número ajustable, no una decisión tomada aquí) → el
  sistema infiere "probablemente ya no está manejando" y PAUSA el wake word
  automáticamente (deja de escuchar), sin necesidad de que el usuario lo
  apague a mano.
- **Si la velocidad vuelve a subir** → se reactiva solo, sin que el usuario
  tenga que volver a prender "Modo conducción".
- Aviso simple en pantalla (no en voz, para no interrumpir una comida o
  reunión) del tipo "Pausamos la escucha automática — parece que no sigues
  manejando" con un botón para reactivarla a mano si el sistema se
  equivocó (ej. tráfico muy lento sostenido).

Esto se apoya en `DrivingModeService` (ADR-0014, ya existe) — la extensión
natural es que ese servicio pase de ser un interruptor manual
("encendido"/"apagado") a tener un tercer estado real, calculado
("encendido pero en pausa por baja velocidad sostenida"), usando datos de
ubicación que YA fluyen por el sistema. No requiere el proveedor de wake
word todavía — es lógica de backend/cliente independiente de qué motor se
elija arriba, así que se puede diseñar en detalle cuando se decida
implementar, sin que bloquee la decisión de proveedor.

## Identificación de quién habla — verificación de hablante (agregado 2026-08-19, pedido nuevo del fundador)

**El pedido real:** "si me llaman y me dicen 'envía este mensaje', la
aplicación lo haga y se identifique esa parte. De lo contrario, si el
sistema escucha a una persona hablar más fuerte, o si escucha a un tercero,
posiblemente se vaya a equivocar ahí." Es decir: no basta con detectar que
"alguien dijo la palabra clave" — hay que confirmar que quien dio la orden
es el dueño real de la cuenta, no un pasajero, no un tercero, no una
conversación de fondo.

### Por qué esto es una tecnología DISTINTA del wake word

El wake word (arriba) solo detecta "se dijo la palabra clave" — no le
importa quién la dijo, cualquier voz sirve. Lo que pide el fundador es
**verificación de hablante** (a veces llamado "voice biometrics" o
reconocimiento de voz por identidad) — una tecnología distinta, que compara
la voz de quien habla contra una muestra de la voz del dueño registrado, y
da un puntaje de "qué tan probable es que sea la misma persona".

### Mitigación que YA existe hoy, sin construir nada nuevo

Vale la pena decirlo primero: las acciones sensibles del asistente (mandar
un mensaje, activar el corredor de emergencia) YA exigen una confirmación
explícita antes de ejecutarse (`requiresConfirmation`, ADR-0016/ADR-0018) —
la primera vez que se pide la acción, el sistema responde "¿confirmas?" y
solo ejecuta si se confirma. Esto ya reduce bastante el riesgo de que un
ruido de fondo o una frase suelta de un tercero dispare un envío real por
accidente, porque haría falta que la voz ajena TAMBIÉN confirme. No es
verificación de identidad, pero ya es una barrera real que existe hoy.

### Diseño propuesto — verificación de hablante real

1. **Enrolamiento**: la primera vez (en Ajustes, una sola vez), se le pide
   al usuario que hable normalmente durante unos segundos — el sistema
   construye una "huella de voz" (un patrón matemático de su voz, no una
   grabación que se pueda reproducir) y la guarda.
2. **Verificación en cada comando**: cuando el asistente recibe una orden
   por voz, compara la voz de quien habló contra esa huella guardada. Si no
   coincide (o la confianza es baja), el sistema puede pedir confirmación
   extra, ignorar el comando, o avisar "no reconozco tu voz, intenta de
   nuevo" — la política exacta (bloquear vs. solo advertir) es una decisión
   de producto a tomar cuando se implemente, no en este ADR.
3. **Motor recomendado: Picovoice Eagle** — investigado el 2026-08-19,
   confirmado como producto real y activo (no descontinuado): reconocimiento
   de hablante 100% en el dispositivo (el audio y la huella de voz NUNCA
   salen del teléfono ni tocan un servidor — mismo nivel de privacidad que
   ya se exige para el resto del proyecto), enrolamiento en segundos con
   habla natural (sin frase fija que memorizar), y verificación desde un
   solo comando corto — exactamente el caso de uso que describe el
   fundador. Está diseñado para combinarse directamente con Porcupine (wake
   word): primero detecta la palabra clave, después verifica que quien la
   dijo es el dueño enrolado — dos pasos, un solo flujo.
4. **Precio de Eagle**: no está publicado por separado (mismo problema que
   Porcupine) — Picovoice exige contactar ventas. Es razonable asumir que
   cae dentro del mismo modelo de precio por "usuarios activos al mes" ya
   visto arriba (gratis muy limitado, luego ~$6,000/año), pero **hay que
   confirmarlo directamente con Picovoice antes de asumir nada** — no se
   encontró un número público específico para Eagle.
5. **Alternativa sin costo**: existen modelos open-source de verificación
   de hablante (ej. `SpeechBrain`, `Resemblyzer`) — igual que con el wake
   word, la alternativa gratis exige más trabajo de integración propio y no
   trae SDK oficial de Android pulido, pero sirve para validar la idea con
   el grupo de prueba antes de pagar por Eagle.

### Cómo encaja con lo demás

Esto no depende de resolver primero lo del nombre personalizado (que quedó
suspendido) ni bloquea la decisión de wake word — son piezas independientes
que se pueden decidir cada una por separado. Si más adelante se retoma el
cifrado de extremo a extremo (ADR-0026), la huella de voz encaja en el mismo
principio: se guarda y se procesa solo en el dispositivo del dueño, nunca en
un servidor.

## Fuera de alcance de este ADR

- Cualquier código de wake word — depende de una decisión de proveedor que
  el fundador no ha tomado todavía.
- El campo `assistant_name` en sí — suspendido explícitamente por el
  fundador (ver "Cambio de alcance"), además de depender de arreglar
  `updateProfile` primero.
- Cualquier código de verificación de hablante — depende de la misma
  decisión de proveedor (Picovoice Eagle u open-source) que el wake word.
