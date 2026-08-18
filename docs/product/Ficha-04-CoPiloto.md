# Ficha de Idea #4 — CoPiloto (nombre provisional): Asistente de Voz tipo Jarvis para Motociclistas

**Estado:** Idea en fase de diseño — cero código escrito todavía; esta ficha es el punto de partida antes de programar nada.
**Segmento:** Inicialmente B2C (motociclista individual, prototipo de uso propio), con visión de expansión B2B (flotas de domicilios/mensajería) y, más adelante, integración física en cascos vía un fabricante en China.
**Clasificación:** Confidencial / Especificación de Producto y Arquitectura

> **Sobre el nombre:** "CoPiloto" es una propuesta de trabajo, no una decisión cerrada — no se verificó disponibilidad de marca ni de dominio. Úsese como placeholder hasta que se elija (o confirme) el nombre definitivo; en ese momento hay que renombrar este archivo y actualizar el índice maestro.

> 📌 **Recordatorio personal del fundador (12 ago 2026, no es parte de la especificación del producto):** A las 8:00 p.m. debe enviar un correo electrónico a María Alejandra — programar recordatorio a las 7:00 p.m.

> ⚠️ **Prioridad señalada por el fundador — patentación (12 ago 2026):** evaluar la protección de propiedad intelectual/patente de la plataforma antes de escalar o mostrar el producto públicamente. Marcado explícitamente como importante, aunque se aborda en profundidad más adelante, no en la fase de front-end actual. Detalle en §9, punto 6.

---

## 1. Resumen ejecutivo

Un asistente de voz personal para motociclistas (y, en un segundo momento, conductores de carro) que centraliza en un solo "wake word" en español lo que hoy está fragmentado entre el sistema operativo del teléfono, WhatsApp, el mapa y el intercom del casco: llamar, leer y responder mensajes, controlar música y volumen, navegar, y — en una fase posterior — ayudar con tareas del mundo real como reservar un restaurante o conseguir una florería de confianza.

La estrategia de construcción es deliberadamente secuencial: **primero el software** (una app que funciona con cualquier casco/manos-libres Bluetooth que el usuario ya tenga), **validar que la experiencia de uso funciona de verdad**, y **solo después** buscar integración física con un fabricante chino de cascos que ya tiene certificaciones de seguridad resueltas — evitando así el costo y el tiempo de convertirse en una startup de hardware desde el día uno.

---

## 2. El problema

- Existen ya sistemas maduros de intercom/manos-libres para motociclistas (Cardo, Sena) y hasta un casco inteligente completo con cámara integrada (Forcite), pero **ninguno unifica WhatsApp, correo y llamadas bajo un solo asistente conversacional en español** — cada uno vive encerrado en su propio ecosistema de comandos (música, intercom, indicaciones de mapa).
- El motociclista sigue teniendo que sacar el celular (o tocarlo) para leer o responder un mensaje, lo cual es exactamente lo que la ley colombiana busca evitar.
- No existe hoy un asistente que, además de controlar el teléfono, ayude con micro-tareas cotidianas del mundo real (buscar y recomendar un sitio confiable) sin que el usuario tenga que salir de la conversación de voz.

---

## 3. Panorama competitivo (verificado por búsqueda directa, julio 2026)

Es importante partir de esto para no construir algo que ya existe:

| Producto | Qué ya resuelve | Qué NO resuelve (el espacio libre) |
|---|---|---|
| **Cardo Packtalk Pro** | Wake word "Hey Cardo", intercom mesh, aprende el patrón de voz del usuario, funciona con ruido de motor/viento | No orquesta WhatsApp, correo, ni tareas fuera de su propio ecosistema |
| **Sena 60S** | Wake word "Hey Sena" con IA, Mesh 3.0, audio Harman Kardon, 8 idiomas | Mismo límite que Cardo — encerrado en su ecosistema propio |
| **Forcite MK1S** (~US$1.099) | Casco completo con cámara integrada (1080p/60fps), navegación con realidad aumentada, alertas por LED periférico | Tampoco integra mensajería personal ni correo por voz |
| **Estándar OBI (Open Bluetooth Intercom)** | Empezó a adoptarse en 2026 para que cascos de distintas marcas se enlacen entre sí, reduciendo el "brand locking" | Es un protocolo de bajo nivel, no un asistente conversacional |

**Conclusión estratégica:** el espacio libre real no es "otro casco con intercom y cámara" (ya resuelto, y por jugadores con capital de hardware). Es la **capa de orquestación por voz** que conecta el teléfono completo (WhatsApp, correo, navegación, tareas) bajo un solo asistente en español — construible como software sobre hardware que ya existe.

Fuentes: [Cardo Packtalk Pro vs Sena 60S (2026)](https://itsbetterontheroad.com/gear/cardo-packtalk-pro-vs-sena-60s/) · [Sena vs Cardo 2026](https://helmetshop.com/blogs/news/sena-vs-cardo-the-ultimate-2026-motorcycle-bluetooth-headset-comparison) · [Cardo vs Sena 2026](https://steel-horse-news.com/cardo-vs-sena-2026-which-mesh-communication-system-is-superior/) · [Forcite MK1S Review](https://ridermagazine.com/2024/01/12/forcite-mk1s-smart-helmet-review-gear/) · [Forcite Helmets — sitio oficial](https://www.forcitehelmets.com/en-us/)

---

## 4. Marco legal colombiano (favorable, verificado)

- La **Resolución 20203040023385 de 2020** del Ministerio de Transporte, vigente desde enero de 2021, prohíbe portar/usar el celular en moto salvo con accesorios de manos libres — es decir, la ley empuja exactamente hacia este producto en vez de ser un obstáculo.
- Si en el futuro se fabrica un casco físico propio (fuera del alcance de esta fase), aplican tres certificaciones posibles en Colombia: **NTC 4533**, **ECE 22.05** y **DOT**, reguladas por el Ministerio de Transporte. Si el dispositivo transmite radiofrecuencia propia (más allá de Bluetooth estándar de un chip ya certificado), aplica además certificación de espectro ante la **ANE** (Agencia Nacional del Espectro). Esto es exactamente lo que la fábrica china aliada ya tendría resuelto — de ahí el valor de esa alianza para la Fase 3 (§8).

Fuentes: [Normatividad de cascos en Colombia — Auteco](https://www.auteco.com.co/blog/post/normatividad-para-los-cascos-en-colombia/) · [Resolución 20203040023385 de 2020](https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=102308) · [Evolución de la normativa de cascos 2020-2025](https://www.inducascos.com/blog/post/la-evolucion-de-la-normativa-en-cascos-de-moto-en-colombia-del-2020-al-2025/)

---

## 5. Arquitectura funcional por niveles de factibilidad

Este es el desglose técnico central del proyecto — cada nivel tiene una naturaleza técnica distinta y debe tratarse como tal, no como una sola lista de "features".

### 5.1 Nivel 1 — Control nativo del teléfono (fácil, sin zona gris)

Abrir apps (YouTube), buscar una canción, subir/bajar volumen a un número exacto, llamar/colgar, tomar y enviar la última foto, buscar un lugar ("¿dónde queda Homecenter?") y navegar hasta allá.

**Cómo se construye:** la app se registra ante Android como el asistente por defecto del sistema (`RoleManager.ROLE_ASSISTANT`, API oficial desde Android 10/API 29 — el mismo mecanismo que usan Google Assistant o Bixby) y dispara `Intent`s nativos del sistema operativo. No hay ambigüedad legal ni de política de plataforma en este nivel.

### 5.2 Nivel 2 — Leer y responder mensajes de WhatsApp (posible, con la API correcta)

"Jheison, te llegó un mensaje de Estefanía" → "léemelo" → "respóndele esto".

**Hallazgo crítico de esta fase de diseño — corrección importante respecto a la primera propuesta técnica:** Google Play endureció su política de uso de `AccessibilityService` con aplicación desde el **28 de enero de 2026**, prohibiendo explícitamente cualquier app donde "IA lea la pantalla y toque botones por el usuario" — y listan literalmente **"assistants" (asistentes)** como un ejemplo de app que ya no califica para usar esa API. Es decir: el enfoque técnico más obvio (simular toques en pantalla dentro de WhatsApp) es hoy una violación directa de política, no un detalle menor.

**Solución correcta, verificada:** usar `NotificationListenerService` (leer el contenido de la notificación — la misma API que usan legítimamente Android Auto o un reloj inteligente, y que la nueva política no restringe) combinada con el mecanismo de **respuesta rápida integrada de la notificación** (`RemoteInput` + `PendingIntent`, el mismo botón "Responder" que ya existe al deslizar una notificación de WhatsApp). No se simula ningún toque en pantalla; se usa la funcionalidad que Android y WhatsApp ya exponen oficialmente para responder desde la barra de notificaciones.

Fuentes: [Google Play — Use of the AccessibilityService API](https://support.google.com/googleplay/android-developer/answer/10964491?hl=en) · [Google Play Accessibility Services Policy Update 2026](https://myappmonitor.com/blog/google-play-accessibility-services-policy-update) · [Google cracks down on accessibility abuse — Malwarebytes](https://www.malwarebytes.com/blog/mobile/2026/03/google-cracks-down-on-android-apps-abusing-accessibility) · [RoleManager — Android Developers](https://developer.android.com/reference/android/app/role/RoleManager)

### 5.3 Nivel 2b — Enviar un mensaje/foto *nuevo* a alguien que no escribió primero (limitación real de plataforma, no de esta app)

Es importante fijar la expectativa correcta desde el diseño: **ni siquiera Google Assistant puede enviar un WhatsApp completamente a ciegas**, porque WhatsApp no expone una API pública de "enviar como el usuario" para cuentas personales (solo existe la API de Business para negocios, que no sirve para esto). Lo máximo alcanzable de forma confiable es abrir WhatsApp con el chat y el mensaje/foto ya listos (`Intent.ACTION_SEND` o el deep link `wa.me`), quedando un único toque de confirmación dentro de la propia WhatsApp. No es 100% manos libres en este caso puntual — pero sí lo es hasta el último segundo, y es una limitación de la plataforma, no un defecto de diseño de esta app.

### 5.4 Nivel 3 (Fase 2, no MVP) — Tareas de "mundo real": reservar restaurante, conseguir flores

Esto es cualitativamente distinto a los niveles anteriores: ya no es "controlar el teléfono", es un **agente que busca, decide y propone** ("encontré 3 floristerías en El Poblado con domicilio hoy, ¿llamo a la primera?"). Requiere un LLM con capacidad de búsqueda y llamado a herramientas externas, no solo Intents del sistema.

**Recomendación de alcance:** para esta fase, el agente debe **buscar y proponer**, nunca reservar/pagar de forma autónoma sin confirmación explícita del usuario — si reserva la hora equivocada o paga de más, la responsabilidad es del producto, no del modelo.

**Sinergia identificada con la Idea #1 (TrustGo, ver [Ficha-01](./Ficha-01-TrustGo.md), §15 punto 6):** en vez de recomendar negocios de una búsqueda genérica de internet, este nivel podría alimentarse del directorio de negocios certificados/con Trust Score de TrustGo — "te recomiendo esta floristería porque está certificada" sería un argumento de confianza mucho más fuerte que un resultado de búsqueda cualquiera. **Esto es solo una idea registrada, no una integración decidida ni iniciada** — ambos proyectos están en etapas demasiado tempranas para comprometerse a una arquitectura compartida todavía.

---

## 6. Arquitectura técnica propuesta (resumen)

```
Wake word (Picovoice Porcupine, español, on-device)
        ↓
Voz → texto (Whisper.cpp local — funciona con ruido de motor sin depender de señal)
        ↓
Router de intención (LLM con function/tool calling)
   ├─ Nivel 1 → Intents nativos de Android (llamada, cámara, volumen, Maps)
   ├─ Nivel 2 → NotificationListenerService + RemoteInput (leer/responder WhatsApp)
   ├─ Nivel 2b → Intent.ACTION_SEND / deep link wa.me (mensaje nuevo, con 1 toque de confirmación)
   └─ Nivel 3 (fase 2) → Agente con búsqueda web + tool calling (y, a futuro, API de TrustGo)
        ↓
Texto → voz (respuesta hablada al usuario)
```

| Componente | Herramienta sugerida |
|---|---|
| Plataforma | Android nativo (Kotlin) — se prioriza sobre iOS porque Android permite registrar la app como asistente del sistema (`ROLE_ASSISTANT`) y expone `NotificationListenerService`; iOS restringe mucho más este tipo de integración profunda (el único camino ahí sería Siri Shortcuts/CarPlay, mucho más limitado) |
| Wake word | Picovoice Porcupine (soporta español, corre en el dispositivo, bajo consumo) |
| STT | Whisper.cpp on-device (prioriza funcionamiento offline/con ruido) |
| TTS | Motor nativo de Android o alternativa on-device de baja latencia |
| Orquestación/NLU | LLM (Claude/GPT) con arquitectura de tool-calling — nunca debe ejecutar una acción sensible directamente sin pasar por la capa determinística de acciones |
| Mensajería | `NotificationListenerService` + `RemoteInput` (Nivel 2), `Intent.ACTION_SEND`/deep link (Nivel 2b) |
| Correo | Gmail API / Microsoft Graph API — soportado oficialmente, sin zona gris |
| Navegación | Intents hacia Google Maps/Waze — no reconstruir el motor de mapas |
| Distribución en fase de prueba | Instalación directa del APK (sideload) — al ser "para hacer pruebas" según lo definido, **no aplica todavía ninguna restricción de política de Google Play**; solo se vuelve relevante el día que se decida publicar en la tienda |

---

## 7. MVP propuesto

**Fase 0 — Prototipo personal (este es el punto de partida inmediato):**
- Nivel 1 completo (control nativo) + Nivel 2 completo (leer/responder WhatsApp vía NotificationListener + RemoteInput).
- Distribución por sideload, sin pasar por Google Play — permite iterar rápido sin fricción de políticas de tienda.
- Objetivo: validar que la experiencia de manejar el teléfono por voz mientras se conduce realmente funciona y se siente natural, antes de invertir en nada más.

**Fase 1 — Pulido y evaluación de publicación:**
- Nivel 2b (mensajes nuevos con confirmación de un toque), correo por voz, pulido de reconocimiento de voz con ruido real de motor.
- Decisión: ¿se publica en Google Play (requiere que el módulo de WhatsApp esté documentado como uso legítimo de `NotificationListenerService`, no de Accessibility) o se mantiene como distribución directa (por ejemplo, ligado a la venta del casco físico más adelante)?

---

## 8. Fases futuras (fuera del alcance inmediato, documentadas para no perderlas)

- **Fase 2 — Nivel 3 (agente de tareas del mundo real):** restaurantes, floristerías, con posible integración con TrustGo (§5.4).
- **Fase 3 — Integración física:** una vez validado el software, buscar al fabricante chino de cascos (ya identificado por el usuario, con certificaciones de seguridad resueltas) para integrar el asistente en un casco físico con intercom propio. En ese punto se vuelven relevantes las certificaciones de §4 (NTC 4533/ECE/DOT y espectro ANE), pero se heredan del fabricante en vez de tramitarse desde cero — la razón estratégica central de haber elegido este orden de desarrollo.
  - **Nota agregada (12 ago 2026, durante la fase de front-end):** el enlace entre la app y la placa/dispositivo físico del casco debe hacerse por Bluetooth, con un proceso de emparejamiento inicial ("primer contacto") entre ambos antes de que puedan comunicarse — igual que emparejar cualquier accesorio Bluetooth. Señalado por el fundador como algo a tener presente para cuando se llegue a esta fase; no se desarrolla todavía, no afecta el trabajo de front-end actual.

---

## 9. Riesgos y cosas a vigilar

1. **Dependencia de comportamiento no documentado de terceros:** tanto el mecanismo de `RemoteInput` de WhatsApp como las políticas de Google Play pueden cambiar sin aviso — antes de invertir en pulir el Nivel 2b conviene revalidar que ambos siguen funcionando igual.
2. **La política de Accessibility de Google Play se verificó en julio de 2026** — si se retoma este proyecto varios meses después, vale la pena volver a buscar la política vigente antes de programar, en vez de asumir que sigue igual.
3. **Nivel 3 (fase 2) es la pieza más ambigua de responsabilidad:** si el agente recomienda o gestiona una compra/reserva real (flores, restaurante) y algo sale mal, hay que decidir desde el diseño qué tanta autonomía se le da versus cuánto se limita a "proponer y que el usuario confirme".
4. **La sinergia con TrustGo (§5.4) es una idea, no un compromiso** — no diseñar ninguna de las dos plataformas asumiendo que la otra ya existe o que la integración es segura.
5. Verificar disponibilidad de marca/dominio antes de comprometerse al nombre "CoPiloto".
6. **Patentación del producto:** el fundador señaló (12 ago 2026) que hay que tener muy presente la protección de propiedad intelectual/patente del producto — se abordará en profundidad más adelante, no durante la fase de front-end, pero queda registrado aquí para no perderlo de vista antes de mostrar o escalar el producto públicamente.

---

## 10. Prototipo iPhone (nube + Shortcuts) — para pruebas personales del fundador

El diseño de §5-§6 es **Android-first a propósito** (línea 105: iOS "restringe mucho más este tipo de integración profunda"). El fundador tiene iPhone y quiere probar el patrón de interacción ya, sin esperar a tener un Android de prueba. Esto no reemplaza el diseño Android — es una vía paralela, más rápida y sin costo de desarrollo de app nativa, para validar la experiencia de uso antes de invertir en la app Android completa. Investigado por búsqueda directa (ago 2026).

### 10.1 Por qué no se traslada 1:1 — la asimetría real entre Android e iOS

El Nivel 2 de Android (leer **y** responder WhatsApp) se apoya en `NotificationListenerService`, una API que Android expone oficialmente y que la política de 2026 no restringe (§5.2). **iOS no tiene ningún equivalente legítimo** — WhatsApp deliberadamente no expone el contenido de sus mensajes a lectores de notificaciones de terceros, por diseño de privacidad de Apple/WhatsApp, no por falta de esfuerzo de ingeniería. Esto no es un problema que se resuelva "programando mejor": es un muro de política de plataforma, de la misma naturaleza que el hallazgo de Accessibility en Android (§5.2) — hay que diseñar alrededor de él, no pelear contra él.

Lo que sí existe en iOS, de forma nativa y sin necesitar cuenta de desarrollador ni pasar por App Store (los Atajos/Shortcuts son automatizaciones personales, no apps publicadas — el mismo espíritu que elegir sideload de APK en Android para la Fase 0, §6 última fila):

| Necesidad | ¿Existe en iOS de forma nativa? |
|---|---|
| Activar por voz sin tocar el teléfono | Sí — "Hey Siri, [nombre del Atajo]" dispara un Shortcut, funciona con pantalla bloqueada y con el micrófono Bluetooth del intercom del casco (perfil HFP estándar) |
| Enviar un mensaje nuevo por WhatsApp | Sí, parcialmente — el Atajo oficial "Enviar mensaje vía WhatsApp" precarga destinatario y texto; hay reportes de la comunidad de que desactivar "Mostrar al ejecutar" evita el toque final de confirmación, pero **no está garantizado y puede cambiar con actualizaciones de WhatsApp — hay que probarlo en vivo antes de asumirlo**, igual que se hizo con el hallazgo de Accessibility en Android |
| Leer un mensaje de WhatsApp de una persona específica | **No.** WhatsApp no expone eso ni a Shortcuts ni a Siri de forma filtrable por remitente. El único acceso nativo es genérico: "Hey Siri, lee mi último WhatsApp" — lee el último mensaje sin leer, de quien sea, no "el mensaje de Ricardo" |
| Enviar y leer mensajes de una persona específica, manos libres, sin tocar nada | Sí — pero con **iMessage/SMS**, no WhatsApp (ver §10.4) |
| Navegar a un lugar o dirección por voz | Sí — Google Maps expone el URL scheme `comgooglemaps://` con parámetros `daddr` (destino) y `directionsmode`, invocable desde un Shortcut |
| Wake word 100% personalizado y en segundo plano permanente | No — la acción "Escuchar Frase" de Shortcuts solo funciona con pantalla activa; en segundo plano solo funciona el "Hey Siri" nativo de Apple, no una palabra de activación propia |

### 10.2 Qué sí se traslada directamente del diseño original

- **El patrón completo de la arquitectura (§6):** Wake → voz-a-texto → router de intención → capa de acciones → texto-a-voz. Es idéntico; solo cambian las herramientas concretas de cada caja.
- **Nivel 1 (control nativo):** navegación, llamadas, volumen — se traslada tal cual, cambiando `Intent`s de Android por acciones nativas de Shortcuts/URL schemes de iOS.
- **Nivel 3 (agente de tareas, §5.4) y la sinergia con TrustGo:** se traslada sin cambios — de hecho encaja mejor aquí, porque este diseño ya pone el router de intención en la nube (ver 10.3), que es exactamente donde vive un agente con tool-calling.
- **La filosofía de "validar antes de comprometerse a más":** igual que Android eligió sideload antes de pensar en Google Play, este prototipo usa Shortcuts personales (cero fricción de App Store) antes de pensar en publicar nada.

### 10.3 Arquitectura propuesta

```
"Hey Siri, Copiloto" (wake nativo de Apple, funciona con pantalla bloqueada)
        ↓
Shortcut de Atajos captura el dictado (STT nativo de iOS/Siri)
        ↓
Shortcut hace POST a un webhook en la nube (Get Contents of URL)
        ↓
Backend en la nube (función serverless) llama a la API de Claude:
   clasifica la intención + extrae entidades (destino, contacto, mensaje)
   y devuelve una respuesta estructurada (JSON)
        ↓
El Shortcut ejecuta la acción determinística según la respuesta:
   ├─ Navegación → comgooglemaps:// con daddr=<destino>
   ├─ Enviar mensaje → acción nativa "Enviar mensaje" (iMessage/SMS) o "Enviar vía WhatsApp"
   ├─ Leer mensaje → "Obtener últimos mensajes" filtrado por remitente (iMessage/SMS)
   └─ Nivel 3 (agente) → el backend ya resolvió la tarea, solo falta hablar la respuesta
        ↓
Acción "Hablar Texto" (Speak Text) — responde en voz alta
```

| Componente | Herramienta | Costo/fricción |
|---|---|---|
| Disparador por voz | Siri nativo + Atajos personalizados (app Shortcuts, ya viene en el iPhone) | Gratis, sin cuenta de desarrollador, no pasa por App Store |
| Voz → texto | Dictado nativo de Siri/Shortcuts | Gratis, incluido |
| Cerebro / router de intención | API de Claude desde un backend serverless (Cloudflare Workers, Vercel Functions o similar) | Costo mínimo por token; capa gratuita cubre pruebas personales |
| Navegación | `comgooglemaps://` URL scheme (`daddr`, `directionsmode`) | Gratis |
| Mensajería (pruebas) | Acciones nativas de Shortcuts sobre iMessage/SMS: "Enviar Mensaje", "Obtener Últimos Mensajes" (filtrable por remitente), "Hablar Texto" | Gratis, sin límites de plataforma |
| Mensajería (WhatsApp real) | Acción "Enviar mensaje vía WhatsApp" — solo envío, con posible toque de confirmación; lectura no disponible | Gratis, pero con techo de plataforma fijo |
| Texto → voz | "Hablar Texto" (Speak Text) nativo | Gratis, incluido |

### 10.4 ¿Hace falta construir una app de mensajería propia?

**No, para las pruebas.** La razón para siquiera considerarlo sería lograr "enviar Y leer mensajes de una persona específica, manos libres" — y eso **ya existe hoy, nativo, gratis, sin escribir una sola línea de una app**, usando iMessage/SMS en vez de WhatsApp como canal de prueba:

- `"Enviar mensaje a Ricardo"` → acción nativa "Enviar Mensaje" de Shortcuts, contacto = Ricardo, sin toque de confirmación.
- `"Reproduce el mensaje de Ricardo"` → acción "Obtener Últimos Mensajes" filtrada por remitente = Ricardo + "Hablar Texto". Esto sí es 100% manos libres y sí es filtrable por persona — algo que WhatsApp no permite en iOS bajo ningún método legítimo (§10.1).

La recomendación es **probar el patrón de interacción completo sobre iMessage/SMS** (haciendo que "Ricardo" te escriba por mensaje de texto normal durante la prueba), y dejar aparte, documentado como límite de plataforma conocido, que sobre WhatsApp real en iOS el techo es: enviar sí (con la salvedad de la tabla 10.1), leer con filtro por persona no. Construir una app de mensajería propia tipo WhatsApp no resolvería esto — el límite es una decisión de política de Apple/WhatsApp, no una limitación técnica que una app nuestra pueda evadir sin, literalmente, ser la propia WhatsApp.

### 10.5 Navegación con Google Maps — autonomía sin "parar entre una cosa y otra"

Con `comgooglemaps://daddr=<lugar o dirección>&directionsmode=driving` invocado desde el Shortcut, ambos escenarios pedidos son directos:

- `"Búscame X lugar y llévame allí"` → el backend extrae "X lugar" del dictado y lo pasa como `daddr` (Google Maps ya resuelve nombres de lugares, no hace falta geocodificar nosotros).
- `"Búscame esta dirección, calle 53 número 20-22, y dame la ruta más fácil"` → mismo mecanismo, `daddr` = la dirección dictada; "la más fácil" se traduce a dejar que Google Maps proponga su ruta por defecto (no hay parámetro para "más fácil" específicamente — es una instrucción para el prompt del backend, no para la URL).

Limitación a anotar: el URL scheme solo soporta los modos `driving`/`walking`/`bicycling`/`transit` — no existe un modo "moto" dedicado en Google Maps (misma limitación que ya existe en Android, no es nueva de este diseño).

### 10.6 Estimado de tiempo de desarrollo

| Fase | Contenido | Estimado |
|---|---|---|
| 0. Disparador | Atajo "Hey Siri, Copiloto" con eco simple ("Hablar Texto" del dictado) — confirmar que el micrófono del intercom activa Siri de forma confiable | 1-2 días |
| 1. Backend en la nube | Función serverless que recibe el texto, llama a Claude para clasificar intención + extraer entidades, devuelve JSON | 2-3 días |
| 2. Navegación | Conectar el backend al Shortcut → `comgooglemaps://`, probar ambos escenarios de lugar/dirección | 1-2 días |
| 3. Mensajería de prueba | Enviar/leer por iMessage-SMS filtrado por contacto; probar por separado el techo real de WhatsApp | 2-3 días |
| 4. Prueba en carretera | Casco/intercom real, ruido de motor, guantes, validar que el flujo completo se siente natural | 2-3 días |
| **Total estimado** | | **8-13 días** de trabajo, no meses — porque se reutilizan piezas nativas de iOS en vez de escribir una app desde cero |

No requiere cuenta de Apple Developer ni publicación en App Store para esta fase — es exactamente la misma lógica que llevó a elegir sideload de APK en Android (§6, última fila): validar primero, sin fricción de tienda, y decidir después si algo de esto se convierte en una app publicada de verdad.

### 10.7 Riesgos específicos de esta vía

1. **Los hallazgos de la tabla 10.1 sobre WhatsApp (toque de confirmación, lectura genérica de Siri) están basados en reportes de comunidad, no en documentación oficial de Meta/Apple — hay que confirmarlos probando en el iPhone real antes de diseñar nada encima de ellos.**
2. El "Hey Siri" en segundo plano depende de que el usuario no lo tenga desactivado y de la calidad del micrófono Bluetooth del casco — probar con el intercom real, no solo con el micrófono del iPhone.
3. Este prototipo no es un sustituto del diseño Android de §5-§9 — es una vía de validación rápida y paralela. Si el proyecto avanza en serio, la decisión de plataforma principal (¿Android, iOS, o ambos?) sigue pendiente y debe tomarse con datos de esta prueba, no antes.

### 10.8 Vía alternativa: app de mensajería propia (solo para pruebas controladas)

Planteada por el fundador como opción para lograr control total por voz — enviar texto por voz, enviar/reproducir notas de voz, y un flujo de "ponme a grabar, yo grabo, tú envías" — sin las limitaciones de plataforma de §10.1/10.4.

**Es técnicamente la vía más simple de las tres (Android nativo, Shortcuts+iMessage, app propia), precisamente porque al ser una app 100% propia no hay ninguna política de Apple/Meta/WhatsApp de por medio que evadir.** Los tres comandos pedidos por el fundador son directos de implementar:

- `"Búscame el contacto Ricardo y envíale un mensaje de texto diciendo que a las 8 nos vemos"` → dictado → backend → mensaje de texto entregado por push.
- `"Envíale un mensaje de voz a Ricardo diciendo que a las 8 nos vemos"` → TTS genera el audio (o se graba la voz del usuario) → se sube y se entrega como nota de voz.
- `"Ponme el mensaje para grabar, yo lo grabo, tú lo envías y yo te digo cuándo termine"` → flujo de grabación con inicio/fin controlado por voz, sin tocar pantalla.

**La limitación real no es técnica, es de adopción (efecto de red):** esta app no se conecta con el WhatsApp real de Ricardo — es una red de mensajería paralela y propia. Solo funciona entre personas que tengan la app instalada. Por eso el alcance correcto para esta fase es **una app de prueba controlada** (el fundador + un puñado de testers, ej. Ricardo), no un reemplazo de WhatsApp — construir eso último sería, en la práctica, reconstruir WhatsApp desde cero, un proyecto completamente distinto y mucho mayor.

**Arquitectura mínima sugerida:**

```
App móvil (envío/recepción) ←→ Backend con base de datos + notificaciones push
   (Firebase o Supabase cubren ambas cosas: mensajería en tiempo real + push,
    sin tener que montar infraestructura propia para el prototipo)
        ↑
Capa de voz (misma que §10.3): dictado → texto, o grabación → nota de voz,
enrutada por el mismo backend de intención que ya se propuso para Maps/mensajería
```

**Estimado de tiempo:** 1-2 semanas para una versión mínima (chat 1 a 1, texto + nota de voz, los tres comandos de voz de arriba), usando Firebase/Supabase como backend en vez de construir servidor propio desde cero — comparable en esfuerzo a la vía de iMessage (§10.6) pero con control total sobre la experiencia de voz, a cambio de necesitar que cada tester instale la app.

**Recomendación de secuencia:** no competir esta vía con la de iMessage (§10.4) — son complementarias. iMessage sirve para validar el patrón de voz esta semana, gratis, sin escribir código de app. La app propia tiene sentido como el siguiente paso *si* la prueba con iMessage confirma que vale la pena invertir en una experiencia de mensajería por voz completamente a medida.

### 10.9 Dos funciones adicionales pedidas para la app propia

**1. Llamar directamente desde la app.** Sí es posible, en dos niveles distintos de esfuerzo:

- **Simple (mismo día):** el comando de voz abre el marcador nativo del iPhone ya con el número de Ricardo listo (`tel://`), como hace cualquier app hoy — no es "llamar sin salir de la app", pero sí es manos libres hasta el último paso, y no requiere ninguna pieza nueva de infraestructura.
- **Llamada real dentro de la app (VoIP con interfaz nativa de llamada):** requiere integrar un SDK de llamadas (ej. Twilio Voice, Agora o Stream Video) más `CallKit` de iOS para que la llamada se vea y se sienta como una llamada normal del sistema. Es una pieza de trabajo aparte, no trivial pero sí muy transitada (patrón estándar de apps tipo Uber/WhatsApp). Estimado: **+3 a 5 días** sobre el estimado de §10.8.

Recomendación: arrancar con la opción simple para la prueba; evaluar VoIP solo si el prototipo demuestra que vale la pena.

**2. Módulo de notas.** Directo de construir sobre la misma base de datos que ya se propuso para mensajería (Firebase/Supabase) — una nota por voz es, técnicamente, el mismo flujo que un mensaje de texto por voz, solo que se guarda en una colección propia en vez de enviarse a otra persona. Encaja de forma natural con el recordatorio que el fundador pidió documentar arriba (correo a María Alejandra a las 8:00 p.m.): si el módulo de notas soporta una **hora opcional de recordatorio** (notificación local de iOS), cubre ambos casos — nota simple y nota con alarma — con la misma pieza. Estimado: **+2 a 3 días** sobre el estimado de §10.8.

### 10.10 Registro por número de celular

Estándar y de bajo esfuerzo — verificación por SMS/OTP, exactamente como WhatsApp/Telegram. Firebase Auth (Phone Auth) o Supabase Auth ya lo traen incorporado sobre el mismo backend propuesto en §10.8; no hay que construirlo desde cero. Estimado: **+1 día**.

### 10.11 Conexión automática entre motos por proximidad ("intercom" vía la app)

Esta es la pieza más ambiciosa de todo lo pedido hasta ahora — hay que ser preciso sobre qué es realista y qué no:

- **La "placa" no se detecta físicamente.** No hay forma de que el celular lea la placa de la moto de Ricardo mientras se conduce (ni cámara ni sensor lo permite de forma segura o confiable). Lo realista es que la placa sea **un dato de perfil** — Ricardo la registra como texto en su cuenta, como un apodo/identificador, no como un mecanismo de detección.
- **La conexión automática sí es viable, pero por proximidad de ubicación (GPS), no por placa.** Si ambos usuarios están en la app, son contactos vinculados, y ambos activaron "conectar automático cuando estemos cerca", el sistema puede abrir un canal de audio (VoIP) cuando la distancia GPS entre los dos baja de un umbral (ej. 200 metros).
- **El auto-contestar sí es viable.** Con un SDK de llamadas (mismo de §10.9) se puede programar que, si el usuario ya dio la orden de voz "conéctame automático con Ricardo", la app conteste la llamada entrante por su cuenta, sin esperar un toque. Es el mismo patrón que ya usa un manos-libres de carro.
- **Comparación honesta con lo que ya existe (§3):** Cardo y Sena resuelven esto mismo hoy, pero por **malla Bluetooth directa entre cascos** — sin depender de datos móviles ni de que la app esté corriendo. La versión de este proyecto depende de señal de datos en ambos celulares; en tramo sin señal, no conecta. No es un defecto de diseño, es una limitación real de hacerlo por software/VoIP en vez de por hardware dedicado — hay que probarlo en carretera real antes de prometerlo como reemplazo de un intercom físico.

### 10.12 Costo de llamadas — respuestas a lo preguntado

**1. ¿Meta le paga a Twilio por las llamadas de WhatsApp, o tienen SDK propio?** Depende de cuál llamada: las llamadas normales entre dos personas en WhatsApp corren sobre infraestructura propia de Meta (no hay evidencia pública de que usen Twilio para esto, y Meta no publica el detalle técnico). Lo que sí confirmé es distinto: en julio de 2025 Meta lanzó "WhatsApp Business Calling", donde **empresas** (no Meta) le pagan a Twilio para recibir/hacer llamadas con sus clientes con la marca de WhatsApp — Twilio es uno de los proveedores oficiales autorizados por Meta para ese producto específico de negocios, no el motor de las llamadas persona-a-persona.

**2. Costo aproximado por llamada si lo construimos nosotros:**

| Proveedor | Tarifa | Para 10-15 personas probando |
|---|---|---|
| Twilio Voice | ~US$0,013-0,014/min (EE. UU.; sube en otros países) — pensado para conectar con números de teléfono reales (PSTN) | Más caro de lo necesario para llamadas app-a-app |
| **Agora** (o similar SDK nativo de VoIP: Stream Video, etc.) | ~US$0,001/min (US$0,99 por 1.000 minutos), con **10.000 minutos gratis al mes** | Con 10-15 personas de prueba, el uso real probablemente **no sale del nivel gratuito** — costo esperado: US$0 |

Recomendación: usar un SDK de VoIP nativo (Agora u otro similar) en vez de Twilio, porque Twilio está tarifado para llamar a números de teléfono reales, y aquí solo se necesita conectar dos usuarios de la misma app.

### 10.13 Android + iOS para el experimento de 10-15 personas

Construir dos apps nativas separadas (Swift para iOS + Kotlin para Android) duplica el trabajo casi por completo. La alternativa estándar de la industria para este caso — un equipo chico, una sola base de código, ambas plataformas — es un framework multiplataforma (**React Native** o **Flutter**): comparativamente toma **~1,6 a 2 veces menos tiempo** que mantener dos apps nativas separadas, compartiendo entre 80-90% del código entre iOS y Android. Para un experimento de 10-15 personas es la opción correcta; nativo por separado solo se justificaría si el proyecto ya tuviera tracción confirmada.

### 10.14 Nota de alcance — leer antes de seguir sumando funciones

Vale la pena decirlo con claridad: lo que arrancó como "una capa de voz sobre apps que ya existen" (§1, §6) se ha ido convirtiendo, pedido por pedido, en **una app de mensajería + llamadas + notas + registro de usuarios + red de proximidad entre motos** — es decir, un producto de comunicaciones completo, no un asistente de voz. No es necesariamente un error: puede ser exactamente lo que se necesita para validar la visión completa con 10-15 personas. Pero es un proyecto bastante más grande que el MVP original de §7, y conviene tenerlo explícito antes de seguir agregando piezas, para decidir con los ojos abiertos si el "experimento" se mantiene acotado a mensajería + voz + proximidad (§10.8-§10.13) o si se sigue expandiendo.

---

## 11. Plan de Implementación Consolidado — app de mensajería propia

Reúne todo lo pedido en las últimas iteraciones (§10.8-§10.14) en un solo plan ejecutable. Todos los estimados de tiempo de abajo **asumen React Native o Flutter desde el día uno** (§10.13) — si en algún punto se decide construir nativo por separado, hay que multiplicar por ~1,6-2x.

### 11.1 Tabla maestra de todas las piezas pedidas

| Pieza | Documentada en | Estimado |
|---|---|---|
| Backend (chat, usuarios, push) | §10.8 | incluido en el estimado base de mensajería |
| Registro por número de celular (OTP) | §10.10 | +1 día |
| Enviar/leer texto por voz (los 2 primeros comandos originales) | §10.8 | 3-4 días (núcleo del producto) |
| Enviar/reproducir nota de voz | §10.8 | 2-3 días |
| Flujo "ponme a grabar / tú lo envías" | §10.8 | incluido arriba |
| Llamada simple (abre marcador nativo) | §10.9 | medio día |
| Llamada real dentro de la app (VoIP + CallKit) | §10.9 | +3-5 días |
| Módulo de notas con recordatorio opcional | §10.9 | +2-3 días |
| Conexión automática por proximidad + auto-contestar | §10.11 | **+4-6 días** (la pieza más riesgosa — GPS en segundo plano, umbral de distancia, auto-respuesta, y probarlo en carretera real) |
| QA cruzado iOS/Android + distribución a 10-15 testers (TestFlight + APK interno) | §10.13 | 2-3 días |
| Integración, bugs, margen | — | 2-3 días |
| **Suma honesta de todo lo pedido** | | **≈ 20-28 días (4-6 semanas), no 1 semana** |

### 11.2 Por qué no cabe todo en una semana

La suma de arriba no es pesimismo — es la misma lógica de estimar por partes que se usó en toda esta ficha (§10.6, §10.8, §10.9). Meter proximidad automática + VoIP + notas + mensajería + registro + doble plataforma en 5-7 días de trabajo real no es realista sin sacrificar algo (o el alcance, o que funcione bien, o ambos). La recomendación es **no comprimir el alcance en el tiempo — comprimir el tiempo recortando el alcance de la primera entrega.**

### 11.3 Lo que sí se puede tener funcionando y probando con gente en 7 días

Prioriza el núcleo de la idea original (voz en vez de escribir) sobre las piezas más nuevas y más riesgosas:

1. Backend + registro por celular (día 1-2).
2. Enviar mensaje de texto por voz + escuchar el último mensaje de un contacto en voz alta — los dos comandos que motivaron todo esto (día 2-5).
3. Botón de llamada simple, sin VoIP todavía (día 5, es medio día de trabajo).
4. Instalar en los teléfonos de 10-15 personas (TestFlight para iOS, APK directo para Android) y empezar a probar (día 6-7).

**Lo que queda fuera de la semana 1, a propósito:** nota de voz grabada, módulo de notas, llamada VoIP dentro de la app, y sobre todo la conexión automática por proximidad — se retoman en las semanas siguientes con datos reales de si la gente ya está usando y le sirve lo básico.

### 11.4 Semanas siguientes (si la semana 1 valida la idea)

- **Semana 2:** nota de voz (grabar/reproducir) + módulo de notas con recordatorio.
- **Semana 3:** llamada VoIP dentro de la app (CallKit + SDK tipo Agora, costo esperado US$0 con este volumen de usuarios, §10.12).
- **Semana 4:** conexión automática por proximidad + auto-contestar — se deja para el final por ser la pieza más nueva y la que depende de probarse en carretera real con señal de datos variable (§10.11).

---

## 12. Próximos pasos inmediatos

**Plan activo (decidido en esta iteración): app propia de mensajería por voz, alcance de §11.3 para la semana 1.**

1. Confirmar el nombre definitivo del proyecto (o mantener "CoPiloto" como decisión) y renombrar esta ficha.
2. Día 1-2: elegir React Native o Flutter, montar backend (Firebase o Supabase) con registro por celular (§10.10).
3. Día 2-5: construir enviar-mensaje-de-texto-por-voz y leer-mensaje-de-contacto-en-voz-alta — los dos comandos originales que motivaron todo el proyecto (§11.3).
4. Día 5: botón de llamada simple vía marcador nativo (§10.9, opción simple — medio día).
5. Día 6-7: instalar en los teléfonos de los 10-15 testers (TestFlight en iOS, APK directo en Android) y empezar a usarlo de verdad, incluyendo en moto con casco/intercom.
6. Con datos reales de la semana 1, decidir el orden de §11.4 (notas, VoIP, proximidad) — no antes.
7. **Vías alternativas ya documentadas, en pausa mientras se prueba la app propia:** el prototipo iPhone con Shortcuts+Siri (§10.1-§10.7) y la app Android nativa con `ROLE_ASSISTANT`/`NotificationListenerService` (§5-§6) — ninguna se descartó, ambas quedan como opción si la app propia no da los resultados esperados.
8. Solo después de validar el software (cualquiera de las vías), retomar la conversación con el fabricante chino de cascos (Fase 3, §8).
