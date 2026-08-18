# Orden de Front-end para Lovable — App de Mensajería "CoPiloto" (nombre provisional)

**Fecha de creación:** 12 de agosto de 2026 · **Última actualización:** 12 de agosto de 2026
**Alcance de este documento:** SOLO front-end (Lovable). El back-end real (lógica de servidor, reglas de seguridad, integraciones) se construye después, por separado, sobre la misma base de datos que aquí se defina.
**Contexto del proyecto:** ver `Ficha-04-CoPiloto.md` — este documento es la ejecución concreta de la decisión tomada en §10.8-§12 de esa ficha: construir una app de mensajería propia, no orquestar WhatsApp real.

**Historial de decisiones de este documento:**
- *v1 (12 ago 2026, mañana):* front-end con Supabase real conectado desde el arranque.
- *v2 (12 ago 2026, tarde):* se revierte esa decisión — Lovable construye solo con datos simulados/mock, sin backend real, por experiencia previa del fundador con errores de Lovable en seguridad y creación de tablas. El esquema real de Supabase se diseña desde cero en la fase de back-end (ver §0 y §9). Se agrega explicación extendida sobre la limitación técnica de Lovable/Capacitor y el riesgo de revisión en App Store (ver §1.1-§1.2).
- *v3-v4 (12 ago 2026, tarde):* onboarding y pestaña Chats verificados como terminados; se agrega prompt de Notas.
- *v5 (12 ago 2026, tarde):* Notas verificada como terminada. Se amplía el alcance de Notas para incluir una capa simple de tareas (pendiente/cumplida), pensada para completarse por comando de voz más adelante (§5.5, §14). Se documenta un defecto de navegación detectado en el chat individual (falta botón de regreso) para corregir antes de seguir con Contactos (§13).
- *v6 (12 ago 2026, tarde):* confirmada la ampliación de tareas en Notas.
- *v7 (12 ago 2026, tarde):* confirmada la corrección de navegación (componente `DetailScreen` reutilizable). Se agrega prompt de Contactos (§15). Dos consideraciones estratégicas de más largo plazo, señaladas por el fundador para dejar registradas pero SIN actuar todavía: (1) el futuro emparejamiento Bluetooth con la placa/dispositivo físico del casco requiere un proceso de enlace inicial ("primer contacto") — se documentó en la ficha original, §8; (2) la protección por patente del producto es un tema a tratar en profundidad más adelante, no en esta fase de front-end — se documentó en la ficha original, §9, como riesgo a vigilar.
- *v8 (12 ago 2026, tarde):* confirmada Contactos. Se agrega prompt de Perfil/Ajustes (§16) — última pantalla de la Fase 1. En la ficha original se agregó además un aviso destacado al inicio del documento sobre la patentación, para que quede visible de inmediato al abrir el archivo (no solo como punto 6 dentro de §9).
- *v9 (12 ago 2026, tarde):* confirmada Perfil/Ajustes. **Fase 1 (MVP de front-end) queda completa.** Pendiente decidir: Fase 2 (paridad extendida) o traslado a fase de back-end.
- *v10 (12 ago 2026, tarde):* decisión tomada — se continúa con Fase 2 en Lovable antes de pasar a back-end. Se agrega registro de avance de Fase 2 (§17) y primer prompt: Chats grupales (§18).
- *v11 (12 ago 2026, tarde):* confirmada la construcción de Chats grupales. El fundador pidió explícitamente diferenciar visualmente el producto de WhatsApp — se definió identidad propia (paleta violeta/índigo + ámbar, burbujas sin cola, tipografía Manrope, iconografía Phosphor, toques de marca ligados a "copiloto") en §6.1, y se agrega un prompt de reskin (§19) que se aplica a todo lo construido hasta ahora antes de seguir con el resto de la Fase 2.
- *v12 (12 ago 2026, tarde):* confirmado el reskin — verificado sin errores de consola. Se agrega prompt de reacciones a mensajes + mensajes que desaparecen (§20), ya construido directamente con la identidad violeta/índigo (sin necesidad de otro reskin).
- *v13 (12 ago 2026, tarde):* confirmadas reacciones y mensajes que desaparecen. Se agrega prompt de archivar/fijar/silenciar chats + búsqueda global (§21).
- *v14 (12 ago 2026, tarde):* confirmado archivar/fijar/silenciar + búsqueda global. El fundador pidió adelantar la pantalla de conexión con la placa del casco (§8/§9 de la ficha original). Se confirmó que hoy no hay placa física ni fabricante contratado, solo el contacto identificado — por lo tanto esta pieza se construye 100% como UI simulada (sin plugin real de Bluetooth), igual que se ha venido trabajando todo el front-end. Se agrega registro en §17.1 y prompt en §22.
- *v15 (12 ago 2026, tarde):* aclaración de terminología — "la placa" en §22 se refiere a la placa/dispositivo electrónico (hardware) que se construirá o comprará más adelante para pruebas reales, no a la placa de la moto (matrícula, ya cubierta como dato de perfil en §10.11 de la ficha original). El fundador confirmó que §22 sí es la pieza correcta. Sin cambios al prompt de §22. Se continúa con la Fase 2: prompt de compartir ubicación (§23).
- *v16 (12 ago 2026, tarde):* confirmadas la pantalla de dispositivo Bluetooth y compartir ubicación. Se agrega el último prompt de la Fase 2: Estados/Historias (§24).
- *v17 (12 ago 2026, tarde):* confirmado Estados/Historias. **Fase 2 completa.** Pendiente decidir: Fase 3 (VoIP real, conexión por proximidad) o traslado a fase de back-end.
- *v18 (12 ago 2026, tarde):* decisión tomada — se traslada el proyecto a la fase de back-end ahora, dejando la Fase 3 (VoIP real, proximidad) en pausa. **Este documento (front-end) queda cerrado como referencia histórica de lo construido en Lovable.** El trabajo de back-end continúa en un documento nuevo.

---

## 0. Decisión de arquitectura (actualizada según tu experiencia previa con Lovable)

**Cambio respecto a la primera versión de este documento:** Lovable va a construir SOLO la parte visual, con datos de prueba/simulados (mock) — sin conectar un proyecto de Supabase real todavía.

Motivo (tal como lo explicaste): en un proyecto anterior, Lovable cometió errores importantes al crear tablas y al configurar seguridad por su cuenta. Dado que este proyecto va a manejar mensajes privados y datos personales, no vale la pena arriesgarse a heredar una base de datos con reglas de seguridad mal puestas desde el arranque — es más limpio y más seguro que yo diseñe el esquema real y las reglas de seguridad desde cero cuando llegue la fase de back-end, y que el front-end de Lovable simplemente quede "listo para conectarse" a esa base cuando exista.

**Qué significa esto en la práctica para el prompt de Lovable:**
- El flujo de OTP, verificación de correo, envío/recepción de mensajes, etc. se simulan con estado local (React state/Context) o datos de ejemplo — la UI se ve y se comporta como si funcionara de verdad, pero no hay backend real detrás.
- Los nombres de los datos (usuario, chat, mensaje, nota, contacto y sus campos) se definen ya de forma prolija y consistente, para que cuando yo construya el esquema real de Supabase, el mapeo entre lo que Lovable ya construyó y la base de datos real sea directo — no hay que rediseñar pantallas, solo "conectar los cables".
- Cuando pasemos a la fase de back-end, yo defino el esquema, las políticas de seguridad (Row Level Security) y la lógica de autenticación real de Supabase, y conectamos eso al front-end ya construido.

Esto no te cuesta tiempo extra más adelante — es exactamente el flujo que ya habías pedido ("tú te encargas de todo el back-end") y de hecho es más seguro que dejar que Lovable improvise tablas y reglas sin supervisión.

---

## 1. Restricción técnica importante de Lovable (verificado hoy)

Lovable **no genera proyectos React Native** — construye aplicaciones web (React + Tailwind CSS, con Supabase como backend integrado). Para publicar en App Store y Google Play, la ruta estándar y soportada es:

1. Lovable construye la app como aplicación web (React + Tailwind + Supabase).
2. Se envuelve esa misma app con **Capacitor** (herramienta que empaqueta una web app como app nativa instalable) para generar los binarios de iOS y Android.
3. Con Capacitor se sube a App Store Connect y Google Play Console como cualquier otra app nativa.

**Qué implica esto para el diseño (importante que Lovable lo sepa desde el prompt inicial):**
- Diseñar 100% mobile-first, sin dependencias de mouse/hover — todo debe funcionar por toque.
- Cualquier función que necesite acceso nativo del teléfono (micrófono para notas de voz, cámara, contactos, notificaciones push, y más adelante llamadas tipo VoIP/CallKit) requiere **plugins de Capacitor**, no APIs web estándar. Hay que dejar previsto en el código dónde se conectará cada plugin, aunque en esta fase de front-end se use una versión simulada de esas funciones si el navegador no lo soporta.
- Ya que compraste el plan de Lovable pensando en esto, esta ruta (Lovable + Capacitor) es la correcta — no hace falta reescribir en React Native aparte.

### 1.1 Explicación completa — para que quede claro que no nos va a limitar ni nos va a dar problemas después

**¿Qué es exactamente Capacitor?** No es un traductor que convierte tu código web en código nativo (eso sí lo hace React Native). Capacitor mete tu app web dentro de un contenedor nativo delgado que muestra esa web en pantalla completa (un WebView) y le da, mediante "plugins", acceso a funciones reales del teléfono: cámara, micrófono, contactos, notificaciones push, almacenamiento seguro, biometría, etc. Es la misma tecnología (o una comparable) que usan apps comerciales conocidas — Apple no prohíbe esta técnica en sí misma.

**¿Qué tanto afecta?**
- Para todo lo que cubre la Fase 1 y la Fase 2 de este proyecto (chats, notas, contactos, perfil, subir fotos, grabar notas de voz, notificaciones, grupos, estados) — prácticamente nada. Son funciones estándar con plugins oficiales de Capacitor, maduros y usados por miles de apps publicadas.
- Donde sí hay una limitación real es en la Fase 3: llamadas de voz/video con interfaz nativa de llamada (CallKit en iOS) y conexión automática en segundo plano por ubicación (§10.11 de la ficha). Ahí Capacitor no trae un plugin oficial "llave en mano" — hay que escribir una pieza pequeña de código nativo (Swift/Kotlin) aparte, algo que la ficha original **ya tenía contemplado como trabajo adicional** para esa fase (§11.1: "+3-5 días" VoIP, "+4-6 días" proximidad), sin importar si se construía en React Native, Flutter o Capacitor. Es decir: esto no es una limitación nueva que introduce Lovable, es el mismo techo técnico que ya sabíamos que existía para esa parte específica.

**¿Nos demoramos más o menos?**
Más rápido para las Fases 1 y 2, no más lento. Al ser una sola base de código web que se reutiliza tal cual para iOS y Android (no dos apps nativas, y de hecho se comparte más código que con React Native, que igual necesita algo de código nativo por plataforma para ciertas cosas), se evita duplicar trabajo. La única parte que toma tiempo aparte es la Fase 3 (VoIP/proximidad) — y ese tiempo ya estaba presupuestado en la ficha original, independiente de la tecnología elegida.

**¿Es más fácil o menos fácil?**
Más fácil para todo lo cubierto por plugins existentes (que es casi todo el producto en esta etapa). Igual de exigente que cualquier otra tecnología para las piezas de integración nativa profunda (VoIP, ubicación en segundo plano) — ahí no hay atajo con ninguna tecnología, ni React Native ni Flutter se libran de escribir algo de código nativo para eso.

**El riesgo real a vigilar — no es técnico, es de revisión en App Store:**
Verifiqué esto hoy porque es justo el tipo de cosa que "da problemas después" si no se anticipa: Apple rechaza bajo su Directriz 4.2 ("Minimum Functionality") las apps que son solo "un sitio web envuelto" — es decir, si un revisor abre la app y es indistinguible de abrir la página web en Safari, la rechazan. **Esto no descalifica a Capacitor como tecnología** (apps grandes como Instagram, Amazon o Basecamp usan WebViews internamente y están aprobadas) — lo que exige Apple es que la app se sienta y funcione como una app real: navegación nativa persistente (nuestra barra inferior de pestañas ya cumple esto), uso real de funciones del dispositivo (cámara, notificaciones push, micrófono — que ya están en nuestra especificación), manejo cuidado de estados de carga/sin conexión, y transiciones que no se sientan como un navegador.

Como este documento ya pide justo eso desde el diseño (navegación nativa, permisos de cámara/micrófono/notificaciones, estados de mensaje, indicadores de "escribiendo…"), el riesgo de rechazo por esta directriz es bajo — pero lo dejo como punto explícito de control de calidad antes de enviar a revisión (ver checklist en §1.2), para no descubrirlo tarde.

### 1.2 Checklist de "no somos un sitio web envuelto" (revisar antes de enviar a App Store/Google Play)

- [ ] Navegación con barra inferior de pestañas nativa, no un menú tipo página web.
- [ ] Al menos cámara, micrófono y notificaciones push funcionando con plugins reales de Capacitor (no simulados) en la versión que se envía a revisión.
- [ ] Pantallas de carga y de "sin conexión" propias del producto, no un error de navegador genérico.
- [ ] Transiciones entre pantallas con la sensación de una app (no recarga de página).
- [ ] Splash screen e ícono propios, configurados a nivel nativo (esto lo maneja Capacitor, pero hay que confirmarlo antes de subir a las tiendas).

---

## 2. Requerimientos clave (tal como los diste, sin reinterpretarlos)

1. **App de mensajería para iOS y Android**, con las funcionalidades que tiene WhatsApp actualmente.
2. **Sección de Notas** — un espacio de notas personal (no un simple recordatorio): crear, ver, buscar y organizar notas de texto o de voz.
3. **Registro y seguridad fuertes:** alta por número de celular con verificación (OTP/SMS), más verificación de correo electrónico.
4. **Preparar el terreno para voz:** más adelante la app se controlará por voz desde un casco conectado por Bluetooth. Esto no se construye ahora, pero el diseño de hoy no debe bloquearlo (ver §7).

---

## 3. Alcance por fases — por qué no todo entra en el primer prompt

Copiar "todo lo que tiene WhatsApp hoy" en un solo desarrollo es un proyecto de varios meses (grupos, estados/historias, canales, comunidades, mensajes que desaparecen, encriptación, llamadas VoIP reales, etc.). Igual que se hizo en el resto de la ficha (§11.2), lo correcto es no comprimir el alcance en el tiempo, sino construir por fases empezando por lo que realmente resuelve el problema original (leer/enviar mensajes sin sacar el celular). Cada fase de abajo es un conjunto de prompts que le puedes dar a Lovable en orden.

### FASE 1 — MVP de front-end (esto es lo que detallamos en este documento)
Registro/login, lista de chats, chat 1 a 1 (texto + notas de voz + imágenes/documentos + estados de mensaje), contactos, sección de Notas, perfil y ajustes, botón de llamada simple.

### FASE 2 — Paridad extendida con WhatsApp (después de validar la Fase 1 con tus 10-15 testers)
Chats grupales, reacciones con emoji, Estados/Historias (24h), chats archivados/fijados/silenciados, búsqueda global, compartir ubicación, mensajes que desaparecen.

### FASE 3 — Llamadas reales y voz (ligado a §10.9/§10.11 de la ficha y a la integración con el casco)
Llamadas de voz/video dentro de la app (interfaz tipo CallKit), conexión automática por proximidad, comandos de voz.

**Este documento cubre en detalle la Fase 1.** Cuando la tengas construida, te preparo los prompts de la Fase 2.

---

## 4. Mapa de pantallas — Fase 1

Navegación principal: barra inferior de pestañas (patrón estándar de apps de mensajería móvil), con 4 secciones:

| Pestaña | Contenido |
|---|---|
| **Chats** | Lista de conversaciones + acceso a cada chat individual |
| **Notas** | Espacio de notas personal |
| **Contactos** | Lista de contactos que ya usan la app + invitar |
| **Perfil/Ajustes** | Perfil propio, seguridad, privacidad, cerrar sesión |

Flujo de entrada (antes de llegar a la navegación principal):

```
Splash/Bienvenida
   ↓
Ingresar número de celular
   ↓
Verificar código OTP (SMS)
   ↓
Ingresar y verificar correo electrónico
   ↓
Crear perfil (foto, nombre, "acerca de")
   ↓
Solicitar permisos (contactos, notificaciones, micrófono, cámara)
   ↓
Navegación principal (Chats / Notas / Contactos / Perfil)
```

---

## 5. Especificación pantalla por pantalla

### 5.1 Onboarding y autenticación

- **Bienvenida:** logo/nombre del proyecto (usar "CoPiloto" como placeholder — ver nota de la ficha original sobre el nombre no confirmado), un botón "Comenzar".
- **Número de celular:** selector de país + campo de número. Validación de formato en vivo. Botón "Enviar código".
- **Verificación OTP:** 6 dígitos, auto-avance entre casillas, botón "Reenviar código" con temporizador (60s), mensaje de error claro si el código es incorrecto o expiró.
- **Correo electrónico:** campo de correo con validación de formato, botón "Verificar correo" que envía un código o enlace. Pantalla de confirmación "Revisa tu correo".
- **Verificación de correo:** pantalla de espera/confirmación (si es por enlace) o campo de código (si es por OTP) — usar el mismo patrón visual que la verificación de celular para consistencia.
- **Crear perfil:** foto de perfil (subir o tomar foto), nombre visible, campo "Acerca de" (como el estado de WhatsApp, ej. "Disponible", texto libre).
- **Permisos:** una pantalla por permiso (contactos, notificaciones, micrófono, cámara), cada una con una frase de una línea explicando *para qué* se necesita — no pedir los 4 de golpe sin contexto. Botón "Permitir" y "Ahora no" en cada una.

**Requisitos para esta sección (dárselos a Lovable explícitamente):**
- Esta fase es visual/simulada: el envío y verificación de OTP y de correo se simulan (por ejemplo, aceptar cualquier código de 6 dígitos tras un pequeño delay, o uno fijo de prueba) — no se conecta un proveedor real de SMS/correo todavía.
- Aun así, diseñar la UI con los estados de seguridad ya contemplados, para no rediseñar después: mensaje de "demasiados intentos, intenta en X minutos" tras varios códigos fallidos, y pantalla de "Dispositivos conectados" en Ajustes (ver 5.6) con opción de cerrar sesión remota.
- **Nota para la fase de backend (no es tarea de Lovable ahora, pero queda documentada):** cuando se conecte la autenticación real, los tokens de sesión se deben guardar en almacenamiento seguro nativo (en Capacitor: `Preferences`/`Secure Storage`, o el manejo de sesión de Supabase Auth pensado para apps híbridas) — nunca en `localStorage`.

### 5.2 Chats — lista

- Lista de conversaciones ordenada por actividad reciente: foto de contacto, nombre, último mensaje (con indicador si es nota de voz/imagen/documento en vez de texto), hora, contador de no leídos.
- Barra de búsqueda arriba (filtra por nombre de contacto o contenido de mensaje).
- Botón flotante "+" para iniciar chat nuevo (abre lista de contactos).
- Gesto de deslizar sobre un chat: silenciar / eliminar (fijar y archivar quedan para Fase 2).

### 5.3 Chat individual

- Encabezado: foto y nombre del contacto, indicador "en línea" / "escribiendo…" / "grabando audio…".
- Burbujas de mensaje diferenciadas por emisor (alineación izquierda/derecha, color distinto).
- Estados de mensaje visibles (enviado / entregado / leído — los "checks" de WhatsApp).
- Tipos de mensaje a soportar en la UI:
  - Texto.
  - Nota de voz: botón de micrófono mantener-para-grabar, con onda de audio animada mientras se graba, reproductor con barra de progreso al recibirla.
  - Imagen/foto (cámara o galería).
  - Documento/archivo.
- Responder a un mensaje específico (swipe o botón, muestra el mensaje citado arriba del nuevo).
- Reenviar mensaje a otro chat.
- Eliminar/editar mensaje propio (con ventana de tiempo — definir tiempo límite en fase de backend).
- Campo de texto inferior con botón que cambia dinámicamente entre "enviar texto" y "mantener para grabar nota de voz" (igual que WhatsApp) + botón de adjuntar (cámara/galería/documento).

### 5.4 Contactos

- Lista de contactos del teléfono que ya tienen la app instalada (requiere permiso de contactos ya solicitado en onboarding).
- Buscador por nombre o número.
- Botón "Invitar" para los contactos que aún no tienen la app (comparte un enlace).
- Agregar contacto manualmente por número de celular.

### 5.5 Notas (espacio personal, no un simple recordatorio)

Aclaración de la instrucción: esto es un **espacio de notas propio del usuario**, no una lista de tareas completa ni un sistema de alarmas — se parece más a una libreta que a un recordatorio, aunque cada nota puede opcionalmente llevar una hora asociada si el usuario lo pide por voz más adelante (ej. "prográmame un correo a las 7pm" se guarda como una nota con hora).

- Lista de notas ordenada por fecha de creación/edición, con buscador.
- Crear nota: texto libre o nota de voz (mismo componente de grabación que en el chat).
- Cada nota: título opcional, contenido, fecha, y un campo opcional "Recordarme a esta hora" (si se activa, se agrega hora — pero por defecto una nota NO tiene hora, es solo un espacio para anotar algo).
- Archivar/eliminar nota.
- Sin carpetas ni etiquetas en esta fase — mantenerlo simple, se puede agregar después si hace falta.

**Actualización (12 ago 2026, tarde) — función de tareas dentro de Notas:** se agrega una capa muy simple de organización de tareas sobre la misma libreta, sin convertirla en un gestor de tareas aparte: una nota se puede marcar opcionalmente como "tarea", y una tarea tiene estado **pendiente** o **cumplida**. El caso de uso central es que, más adelante, un comando de voz del tipo *"Copiloto, táchame la tarea de llamar a la administración porque ya la completé"* pueda marcarla como cumplida sin abrir la app — por eso la acción de completar una tarea debe quedar como una función aislada e invocable por su identificador, no solo como un toque en pantalla (ver detalle en §14). En esta fase de front-end la selección de "cuál tarea" la hace el usuario tocando la nota; la búsqueda por descripción hablada ("la tarea de llamar a la administración") es lógica de backend/voz que se resuelve más adelante, no algo que construya Lovable ahora.

### 5.6 Perfil y ajustes

- Ver/editar perfil (foto, nombre, "acerca de", número de celular, correo).
- **Seguridad:** cambiar método de verificación, ver dispositivos conectados con opción de cerrar sesión remota, activar verificación en dos pasos (UI lista, aunque la lógica final se define en backend).
- **Privacidad:** quién puede ver tu foto/estado/última conexión (UI lista, placeholders — se conecta a reglas reales en fase de backend).
- **Notificaciones:** activar/desactivar por tipo (mensajes, notas).
- Cerrar sesión.

### 5.7 Llamada — versión simple de esta fase

Por ahora, **no** se construye VoIP real (eso es Fase 3, ficha §10.9). En esta fase:
- Botón de llamada en el encabezado del chat individual y en la lista de contactos.
- Al presionarlo, abre el marcador nativo del teléfono con el número del contacto ya cargado (acción simple, sin infraestructura nueva).
- Diseñar el botón y su ubicación ya pensando en que en Fase 3 este mismo botón dispare una llamada VoIP dentro de la app en vez de abrir el marcador — no debe requerir rediseño.

---

## 6. Sistema de diseño

> **Actualización (12 ago 2026, tarde):** el fundador pidió explícitamente que el producto no se sienta "idéntico a WhatsApp" a simple vista. Se definió una identidad visual propia (paleta violeta/índigo) que reemplaza los placeholders originales de esta sección — ver §6.1 y el prompt de reskin en §19.

- **Mobile-first, un solo idioma visual para iOS y Android** (no dos sistemas de diseño separados — Capacitor empaqueta la misma UI para ambos).
- **Modo claro y oscuro** desde el día uno (patrón esperado en cualquier app de mensajería moderna).
- **Objetivos táctiles grandes** (mínimo 44-48px) — coherente con el objetivo final del producto (uso mientras se conduce, con guantes, glanceable), aunque en esta fase el uso principal sea con el teléfono en la mano.
- **Alto contraste** en textos y estados de mensaje — debe leerse bien también con luz solar directa.
- Tipografía del sistema (San Francisco/Roboto según plataforma, o una tipografía sans-serif neutra si Lovable prefiere una sola para ambas).
- Paleta de color: **definida (12 ago 2026) — ver §6.1**, ya no queda abierta a que Lovable proponga.
- Iconografía consistente: set Phosphor Icons, peso "regular" o "duotone" (terminales redondeadas, no el estilo lineal genérico) — ver §6.1.

### 6.1 Identidad visual propia — para no verse "igual a WhatsApp"

Decisión explícita del fundador: el producto debe copiar la funcionalidad de WhatsApp pero **no debe parecerse a WhatsApp a simple vista**. Esto se resuelve en cuatro frentes, todos ya definidos para no dejarlo a la improvisación de Lovable:

**1. Color de marca — violeta/índigo, no verde:**
- Primario: `#5B4FE5` (violeta-índigo) — ni el verde de WhatsApp, ni el azul de Messenger/Telegram, ni el amarillo de Snapchat.
- Acento cálido, de uso deliberadamente escaso (insignias de no leídos, indicadores "en vivo", el botón de grabar nota de voz): `#F5A623` (ámbar). El contraste frío/cálido entre el violeta y el ámbar es lo que le da personalidad propia — no es "otra app morada de SaaS".
- Superficies neutras: gris cálido claro `#F1F0F7` en modo claro, gris carbón `#17151F` en modo oscuro (no el gris azulado típico).
- Estados de sistema estándar (éxito, error, advertencia) sin cambios — verde/rojo/ámbar convencionales, esos sí deben ser reconocibles.

**2. Burbujas de mensaje con forma propia, sin la "colita" de WhatsApp:**
- Completamente redondeadas (radio ~20px), sin el pico/tail que WhatsApp pone en la esquina de la burbuja.
- Mensaje propio: fondo sólido violeta (`#5B4FE5`), texto blanco.
- Mensaje ajeno: fondo gris neutro (`#F1F0F7`/`#2A2733` en oscuro), texto oscuro/claro según el modo — nunca blanco puro como en WhatsApp.
- Mensajes consecutivos del mismo remitente se agrupan visualmente (radio reducido entre burbujas contiguas, como iMessage) en vez de repetir una burbuja completa con cola cada vez.

**3. Tipografía propia en vez de la fuente del sistema operativo:**
- Como la app es en el fondo una app web (Lovable + Capacitor, ver §1), se puede aplicar una tipografía propia consistente en iOS y Android — a diferencia de WhatsApp, que se ve distinto en cada sistema operativo porque usa la fuente nativa de cada uno.
- Usar **Manrope** (geométrica, cálida, variable en pesos, de uso libre) para toda la interfaz: títulos, cuerpo de texto y mensajes. Esto por sí solo hace que la app no se sienta como ninguna de las dos plataformas nativas.

**4. Toques de marca ligados a la identidad de "copiloto" (asistente), no solo a "otra app de chat":**
- El botón de grabar nota de voz lleva el color de acento ámbar con una animación de pulso sutil — un guiño visual a que este producto, más adelante, escucha y responde por voz (sin construir nada de voz todavía, solo el lenguaje visual).
- Textos de estados vacíos con personalidad propia en vez de copys genéricos (ej. "Tu copiloto está listo" en vez de "No tienes chats aún").
- La barra inferior de 4 pestañas ya es, de por sí, una diferenciación intencional: WhatsApp usa pestañas arriba en Android y abajo en iOS — nosotros usamos el mismo patrón en ambas plataformas, reforzando que es un producto propio, no un clon 1:1 de la experiencia de ninguna plataforma.
- La pestaña Notas (con tareas) ya es una diferenciación estructural — WhatsApp no tiene nada equivalente. Vale la pena que en el reskin no quede como "una pestaña más", sino que se sienta parte intencional del producto.

---

## 7. Por qué el diseño de hoy no debe bloquear la voz de mañana

No se construye nada de voz en esta fase, pero para que la futura integración con el casco (Fase 3) no obligue a rehacer pantallas, pídele a Lovable que:

- Cada acción clave (leer un mensaje, enviar un mensaje, abrir una nota, iniciar una llamada) se implemente como una función aislada y reutilizable en el código — no como lógica enterrada solo dentro de un botón — para que después un comando de voz pueda invocar la misma función que hoy invoca un toque en pantalla.
- Se evite anidar acciones importantes detrás de múltiples pasos de confirmación innecesarios (cada paso extra hoy es un paso extra que la voz tendrá que replicar mañana).

---

## 8. Prompt maestro para pegar en Lovable (primer mensaje)

Copia y pega esto como el primer prompt en tu proyecto de Lovable. Está escrito para que Lovable entienda de una vez el alcance, el stack y la Fase 1 completa:

```
Quiero construir SOLO el front-end de una app de mensajería móvil (para iOS y Android,
publicada luego con Capacitor en App Store y Google Play). Usa React + Tailwind CSS.

Importante: en esta fase NO conectes un backend real (no Supabase, no ningún proveedor
de autenticación/SMS/correo real). Todo se maneja con estado local (React state/Context)
y datos de ejemplo, simulando los flujos como si funcionaran de verdad (por ejemplo,
el código OTP se puede simular aceptando cualquier código de 6 dígitos tras un pequeño
delay). Eso sí: nombra los datos (usuario, chat, mensaje, nota, contacto y sus campos)
de forma prolija y consistente, porque más adelante se va a conectar a un backend real
y esos nombres/estructuras se van a reutilizar.

Diseño: mobile-first, modo claro y oscuro, objetivos táctiles grandes (mínimo 44px),
alto contraste, tipografía del sistema, un set de iconos consistente. Usa navegación
nativa persistente (barra inferior de pestañas) y una sensación de app real en cada
transición — no debe sentirse como una página web (esto importa para pasar la revisión
de Apple más adelante).

Navegación principal: barra inferior con 4 pestañas — Chats, Notas, Contactos,
Perfil/Ajustes.

Flujo de entrada (antes de la navegación principal):
1. Bienvenida con botón "Comenzar"
2. Ingresar número de celular (selector de país + validación) → enviar OTP
3. Verificar OTP de 6 dígitos con auto-avance, reenvío con temporizador de 60s
4. Ingresar correo electrónico → verificarlo (código o enlace)
5. Crear perfil: foto, nombre, campo "Acerca de"
6. Pantallas de permisos (una por una, con una frase explicando para qué):
   contactos, notificaciones, micrófono, cámara

Pestaña Chats:
- Lista de conversaciones: foto, nombre, último mensaje, hora, contador de no leídos,
  buscador arriba, botón flotante "+" para chat nuevo
- Chat individual: burbujas diferenciadas por emisor, estados de mensaje (enviado/
  entregado/leído), indicador "escribiendo…"/"grabando audio…", soporte para texto,
  notas de voz (mantener botón de micrófono para grabar, con onda animada y
  reproductor al recibir), imágenes, documentos, responder a un mensaje citándolo,
  reenviar, eliminar/editar mensaje propio. Botón de llamada en el encabezado que
  por ahora abre el marcador nativo del teléfono con el número cargado.

Pestaña Notas (espacio de notas personal, NO un simple recordatorio):
- Lista de notas por fecha, buscador
- Crear nota de texto o de voz, título opcional
- Cada nota puede tener opcionalmente una hora de recordatorio, pero por defecto
  no la tiene — es una libreta, no una lista de alarmas

Pestaña Contactos:
- Lista de contactos del teléfono que ya usan la app, buscador, botón invitar para
  los que no la tienen, agregar contacto manual por número

Pestaña Perfil/Ajustes:
- Ver/editar perfil (foto, nombre, "acerca de", celular, correo)
- Sección Seguridad: dispositivos conectados con opción de cerrar sesión remota,
  verificación en dos pasos (UI, la lógica final se conecta después)
- Sección Privacidad: quién ve foto/estado/última conexión (UI, placeholders)
- Notificaciones por tipo, cerrar sesión

Requisito de arquitectura: cada acción clave (leer mensaje, enviar mensaje, abrir
nota, iniciar llamada) debe ser una función aislada y reutilizable en el código,
no lógica enterrada solo dentro de un botón — más adelante estas mismas funciones
se conectarán a un backend real y también se dispararán por comando de voz.

Empecemos por el flujo de onboarding completo (pantallas 1-6 de arriba) con el
sistema de diseño ya aplicado, y de ahí seguimos con las 4 pestañas una por una.
```

**Cómo seguir después de este primer prompt:** una vez Lovable construya el onboarding, dale un prompt separado por cada pestaña (Chats → Notas → Contactos → Perfil), refiriéndote a las secciones 5.2 a 5.6 de este documento. Construirlo en pedazos da mejores resultados que pedirlo todo de una vez, y te permite revisar y ajustar antes de seguir.

---

## 9. Registro de avance de la Fase 1

| Pantalla/bloque | Estado | Notas |
|---|---|---|
| Onboarding (1-6: bienvenida → celular → OTP → correo → perfil → permisos) | ✅ Hecho (12 ago 2026) | Sistema de diseño aplicado, claro/oscuro, objetivos táctiles de 44px, transiciones tipo push nativo, barra inferior de 4 pestañas montada. Acciones de auth/permisos como funciones aisladas y reutilizables. Modelo de datos tipado: `UserProfile`, `Chat`, `Message`, `Note`, `Contact`. |
| Pestaña Chats (lista + chat individual) | ✅ Hecho (12 ago 2026) | Lista con buscador, swipe silenciar/eliminar, FAB con selector de contactos; conversación con burbujas, estados, notas de voz, imágenes, documentos, responder, reenviar, editar/eliminar (ventana 15 min). Acciones aisladas en `src/lib/actions/chats.ts`. |
| Pestaña Notas | ✅ Hecho (12 ago 2026) | Libreta ordenada por actividad con buscador, swipe archivar/eliminar, FAB, editor con título opcional, texto o nota de voz (mismo grabador de Chats), recordatorio opcional apagado por defecto, autoguardado al salir. Acciones aisladas en `src/lib/actions/notes.ts`. |
| Ampliación: tareas pendientes/cumplidas en Notas | ✅ Hecho (12 ago 2026) | Marca opcional "Es una tarea", chips Todas/Pendientes/Cumplidas, checkbox en la lista. `completeTask(id)`, `reopenTask(id)`, `toggleTask(id)` aisladas en `src/lib/actions/notes.ts`, listas para invocarse desde el copiloto de voz más adelante. |
| Pestaña Contactos | ✅ Hecho (12 ago 2026) | Lista alfabética con buscador, sección de invitaciones, alta manual por número, detalle con `DetailScreen` (mensaje crea/abre el chat, llamada simulada). El selector de Chats/reenvío ahora consume esta lista como única fuente. Acciones aisladas en `src/lib/actions/contacts.ts`. |
| Pestaña Perfil/Ajustes | ✅ Hecho (12 ago 2026) | Perfil editable con celular/correo de solo lectura (aviso de reverificación), subpantallas Seguridad (2FA + dispositivos con cierre de sesión individual), Privacidad (Todos/Mis contactos/Nadie) y Notificaciones, cierre de sesión con confirmación. Acciones aisladas en `src/lib/actions/profile.ts`. |

**Fase 1 (MVP de front-end) completa — 12 ago 2026.** Onboarding, Chats, Notas (con tareas), Contactos y Perfil/Ajustes construidos con datos simulados, diseño consistente, navegación con `DetailScreen` reutilizable y todas las acciones aisladas por pantalla (`chats.ts`, `notes.ts`, `contacts.ts`, `profile.ts`). Decisión pendiente: seguir con los prompts de Fase 2 (§3) o trasladar el proyecto para arrancar el back-end (§10).
| **Corrección: botón de regreso en chat individual** | ✅ Confirmado (12 ago 2026) | Chevron de regreso junto a avatar/nombre, mediante componente `DetailScreen` reutilizable — ya aplicado también al editor de notas y listo para Contactos y futuras pantallas secundarias. Swipe-back desde el borde izquierdo verificado en navegador. |

## 10. Qué necesito de vuelta cuando termines el front-end

Cuando Lovable entregue la Fase 1 y traslades el proyecto para acá, para arrancar el back-end voy a necesitar:
1. El repositorio/código exportado de Lovable (front-end con datos simulados).
2. Confirmación de qué pantallas quedaron fuera del alcance original (si hubo ajustes sobre la marcha).
3. La lista de nombres/estructuras de datos que Lovable terminó usando (usuarios, chats, mensajes, notas, contactos) para que el esquema real de Supabase que yo diseñe encaje sin fricción con lo que ya construiste.

Con eso arranco desde cero, con foco fuerte en seguridad: creo el proyecto de Supabase, diseño el esquema de base de datos y las políticas de seguridad (Row Level Security) desde el principio, conecto autenticación real (OTP por SMS + verificación de correo), lógica de mensajería en tiempo real, y reemplazo cada parte simulada del front-end por su versión conectada al backend real. Como no hubo un backend real construido de afán en la fase de Lovable, este esquema queda limpio desde el día uno — sin las tablas o reglas heredadas que dieron problemas en el proyecto anterior.

---

## 11. Prompt para pegar en Lovable — pestaña Chats (siguiente paso)

Continúa en el mismo proyecto de Lovable (mismo sistema de diseño, misma barra de 4 pestañas, mismos tipos `UserProfile`/`Chat`/`Message`/`Contact` ya definidos). Corresponde a §5.2 y §5.3 de este documento.

```
Ahora construyamos la pestaña Chats, reutilizando el sistema de diseño, la barra
inferior de pestañas y los tipos de datos (Chat, Message, Contact, UserProfile)
que ya están definidos. Sigue usando datos simulados/mock — todavía no hay backend
real conectado.

PANTALLA 1 — Lista de chats:
- Lista de conversaciones ordenada por actividad más reciente: foto del contacto,
  nombre, vista previa del último mensaje (si es nota de voz/imagen/documento,
  mostrar un indicador de tipo en vez de intentar mostrar el contenido), hora,
  contador de mensajes no leídos.
- Buscador arriba de la lista, filtra por nombre de contacto o contenido del mensaje.
- Botón flotante "+" para iniciar un chat nuevo: por ahora, como la pestaña Contactos
  todavía no existe, abre un selector simple con datos de contactos de ejemplo
  (usando el tipo Contact ya definido) — este selector se reemplaza más adelante
  por la pestaña Contactos real, así que constrúyelo como un componente aparte
  y reutilizable, no como algo enterrado dentro de esta pantalla.
- Gesto de deslizar sobre un chat: silenciar / eliminar (fijar y archivar quedan
  para una fase posterior, no los construyas todavía).

PANTALLA 2 — Chat individual:
- Encabezado: foto y nombre del contacto, indicador de estado ("en línea" /
  "escribiendo…" / "grabando audio…" — simulado), botón de llamada que por ahora
  simplemente simula abrir el marcador nativo del teléfono (placeholder, sin
  integración real todavía).
- Burbujas de mensaje diferenciadas por emisor (alineación y color distintos),
  con estados de mensaje visibles (enviado / entregado / leído — los "checks").
- Tipos de mensaje a soportar en la UI:
  · Texto
  · Nota de voz: mantener presionado el botón de micrófono para grabar, con onda
    de audio animada mientras se graba; al recibir una nota de voz, mostrar un
    reproductor con barra de progreso
  · Imagen (cámara o galería — simulado en esta fase)
  · Documento/archivo (simulado en esta fase)
- Responder a un mensaje específico (deslizar o botón), mostrando el mensaje
  citado arriba del nuevo mensaje.
- Reenviar un mensaje a otro chat (reutiliza el mismo selector de contactos/chats
  del botón "+" de la lista de chats).
- Eliminar/editar un mensaje propio, con una ventana de tiempo de ejemplo (15
  minutos) — esto se ajusta cuando el backend real defina la regla final.
- Campo de texto inferior: el botón cambia dinámicamente entre "enviar texto" y
  "mantener para grabar nota de voz" según si hay texto escrito, más un botón de
  adjuntar (cámara / galería / documento).

Recuerda: cada acción (abrir chat, enviar mensaje, grabar nota de voz, responder,
reenviar, iniciar llamada) debe quedar como una función aislada y reutilizable en
el código — no lógica enterrada solo dentro de un botón.
```

Cuando esto quede construido, seguimos con la pestaña Notas (§5.5).

---

## 12. Prompt para pegar en Lovable — pestaña Notas (siguiente paso)

Continúa en el mismo proyecto. Corresponde a §5.5 de este documento. Sigue el mismo patrón de arquitectura que ya usaste en Chats (acciones aisladas en su propio archivo, ej. `src/lib/actions/notes.ts`, siguiendo el mismo estilo que `src/lib/actions/chats.ts`).

```
Ahora construyamos la pestaña Notas, reutilizando el sistema de diseño y el
componente de grabación de nota de voz que ya construiste para Chats (mismo
botón de mantener-para-grabar con onda animada y reproductor con barra de
progreso). Aísla las acciones en su propio archivo (ej. src/lib/actions/notes.ts),
siguiendo el mismo patrón que usaste en chats.ts. Sigue usando datos simulados,
sin backend real conectado.

Aclaración de producto importante: esto es un espacio de notas personal — se
parece más a una libreta que a una lista de tareas o de alarmas. La mayoría de
las notas NO tienen hora asociada.

PANTALLA 1 — Lista de notas:
- Lista ordenada por fecha de creación/edición más reciente (título si existe,
  si no, las primeras palabras del contenido; fecha; ícono si es nota de voz).
- Buscador arriba, filtra por título y contenido.
- Botón flotante "+" para crear una nota nueva.
- Deslizar sobre una nota: archivar / eliminar.

PANTALLA 2 — Crear/editar nota:
- Título opcional (campo de texto simple).
- Contenido: texto libre, o nota de voz usando el mismo grabador de Chats.
- Campo opcional "Recordarme a esta hora" — un interruptor apagado por defecto;
  si el usuario lo activa, aparece un selector de hora. Si está apagado, la nota
  se guarda sin ninguna hora asociada — no fuerces una hora por defecto.
- Guardar automáticamente al salir de la pantalla (no un botón "Guardar" aparte,
  igual que una libreta real no te obliga a confirmar cada anotación).

No construyas carpetas, etiquetas ni categorías todavía — el alcance de esta
fase es intencionalmente simple.

Recuerda: cada acción (crear nota, editar, archivar, eliminar, activar
recordatorio) debe quedar como una función aislada y reutilizable, igual que
en Chats.
```

Cuando esto quede construido, seguimos con la pestaña Contactos (§5.4).

---

## 13. Prompt para pegar en Lovable — corrección urgente: falta botón de regreso en el chat individual

Detectado al probar lo ya construido: al abrir un chat no hay forma de volver a la lista de chats (ni a ninguna otra pantalla). Corregir esto antes de seguir avanzando, porque es un patrón de navegación que se va a repetir en Notas, Contactos y Perfil si no se resuelve bien ahora.

```
Encontré un problema de navegación: cuando abro un chat individual, no hay ningún
botón para regresar a la lista de chats — la pantalla queda sin salida.

Corrígelo así:
- Agrega un botón de regreso (flecha o chevron a la izquierda) en el encabezado
  del chat individual, junto a la foto y nombre del contacto, que regrese a la
  lista de chats.
- Revisa que este mismo patrón de "botón de regreso en el encabezado al entrar
  a una pantalla de detalle" quede como un componente reutilizable, porque lo
  vamos a necesitar igual en el detalle de una nota y, más adelante, en el
  detalle de un contacto y en cualquier pantalla secundaria dentro de las 4
  pestañas principales.
- Verifica también el gesto nativo de "deslizar desde el borde izquierdo para
  regresar" (swipe-back), que es el comportamiento esperado en iOS y debe
  funcionar igual que el botón.
```

## 14. Prompt para pegar en Lovable — mejora: tareas pendientes/cumplidas dentro de Notas

Amplía lo que ya construiste en Notas (no es una pantalla nueva, es una capa sobre la libreta ya hecha). Corresponde a la actualización de §5.5.

```
Vamos a ampliar la pestaña Notas (ya construida) para soportar una capa simple
de tareas, sin convertirla en un gestor de tareas aparte — la libreta sigue
siendo el mismo espacio, esto es solo una marca opcional sobre una nota.

- Al crear o editar una nota, agrega un interruptor opcional "Es una tarea"
  (apagado por defecto, igual que el de recordatorio). Si se activa, la nota
  pasa a tener un estado: pendiente o cumplida (por defecto, pendiente).
- En la lista de notas, agrega un filtro simple arriba (ej. pestañas pequeñas
  o chips: "Todas" / "Pendientes" / "Cumplidas") que solo afecta a las notas
  marcadas como tarea — las notas normales (sin marcar) siempre aparecen en
  "Todas".
- Cada nota-tarea en la lista muestra una casilla/checkbox visible. Al tocarla:
  si estaba pendiente, pasa a cumplida (texto con tachado, ícono de check,
  se mueve al filtro "Cumplidas"); si estaba cumplida, puede volver a pendiente
  tocándola de nuevo (por si el usuario se equivoca).
- Implementa la acción de completar/reabrir una tarea como una función aislada
  y reutilizable que reciba el identificador de la nota (ej. completeTask(id),
  reopenTask(id) en src/lib/actions/notes.ts) — NO la enredes solo dentro del
  evento de click del checkbox. La razón: más adelante un comando de voz va a
  invocar esta misma función directamente (ej. "Copiloto, marca como cumplida
  la tarea de llamar a la administración"), sin pasar por la pantalla.
- No construyas todavía la búsqueda de "cuál tarea" por texto hablado — en esta
  fase, la función simplemente recibe el id de una tarea ya identificada.
```

Cuando esto quede corregido y ampliado, seguimos con la pestaña Contactos (§5.4).

---

## 15. Prompt para pegar en Lovable — pestaña Contactos

Continúa en el mismo proyecto. Corresponde a §5.4. Reutiliza el componente `DetailScreen` (con chevron de regreso) ya usado en el chat individual y en el editor de notas, y el selector de contactos que ya construiste como componente aparte para el botón "+" de Chats — esta pestaña se convierte en la fuente real de esos datos.

```
Ahora construyamos la pestaña Contactos, reutilizando el sistema de diseño, el
componente DetailScreen (con chevron de regreso) que ya usaste en el chat
individual y en el editor de notas, y el mismo modelo de datos Contact que ya
existe. Sigue usando datos simulados, sin backend real.

PANTALLA 1 — Lista de contactos:
- Lista de contactos (datos de ejemplo) que "ya tienen la app", ordenados
  alfabéticamente, con foto y nombre.
- Buscador arriba, filtra por nombre o número.
- Sección aparte (o botón) para contactos que NO tienen la app todavía, cada
  uno con un botón "Invitar" que simula compartir un enlace.
- Botón para "Agregar contacto" manualmente por número de celular (formulario
  simple: número + nombre opcional).
- IMPORTANTE: esta pantalla es ahora la fuente real de datos de contactos.
  Actualiza el selector de contactos que ya construiste para el botón "+" de
  Chats (y el de reenviar mensaje) para que reutilice esta misma lista, en vez
  de tener datos de ejemplo duplicados en dos lugares.

PANTALLA 2 — Detalle de contacto (al tocar un contacto):
- Usa el componente DetailScreen (chevron de regreso).
- Foto grande, nombre, número.
- Botones: "Enviar mensaje" (abre el chat con ese contacto — créalo si no
  existe todavía) y "Llamar" (mismo comportamiento simulado que el botón de
  llamada del chat individual).

Recuerda: cada acción (buscar, invitar, agregar contacto, abrir chat desde el
detalle) debe quedar como función aislada y reutilizable, siguiendo el mismo
patrón de chats.ts y notes.ts (ej. src/lib/actions/contacts.ts).
```

Cuando esto quede construido, seguimos con la última pestaña de la Fase 1: Perfil/Ajustes (§5.6).

---

## 16. Prompt para pegar en Lovable — pestaña Perfil/Ajustes (última pantalla de la Fase 1)

Continúa en el mismo proyecto. Corresponde a §5.6. Reutiliza `DetailScreen` para las subsecciones (Seguridad, Privacidad, Notificaciones) y el modelo `UserProfile` ya definido desde el onboarding.

```
Ahora construyamos la última pestaña de esta fase: Perfil/Ajustes. Reutiliza el
sistema de diseño, DetailScreen para las subpantallas, y el modelo UserProfile
ya definido. Sigue usando datos simulados, sin backend real.

PANTALLA PRINCIPAL — Perfil/Ajustes:
- Encabezado con foto, nombre y "acerca de" del usuario, editables.
- Campos de solo lectura visibles pero no editables directamente aquí: número
  de celular y correo (para cambiarlos hace falta pasar de nuevo por
  verificación — no lo construyas ahora, solo deja el campo y un texto
  explicando que requiere reverificación).
- Lista de accesos a subpantallas (cada una usa DetailScreen): Seguridad,
  Privacidad, Notificaciones.
- Botón "Cerrar sesión" al final, con confirmación antes de ejecutar.

SUBPANTALLA — Seguridad:
- "Dispositivos conectados": lista de dispositivos de ejemplo con opción de
  "Cerrar sesión en este dispositivo" por cada uno.
- Interruptor "Verificación en dos pasos" (UI funcional en estado local; la
  lógica real de backend se conecta después).

SUBPANTALLA — Privacidad:
- Tres controles de "quién puede ver": foto de perfil, "acerca de", última
  conexión — cada uno con opciones tipo "Todos / Mis contactos / Nadie"
  (simulado, sin reglas reales todavía).

SUBPANTALLA — Notificaciones:
- Interruptores por tipo: mensajes nuevos, notas con recordatorio.

Recuerda: cada acción (editar perfil, cerrar sesión de un dispositivo, cambiar
un ajuste) debe quedar como función aislada y reutilizable, siguiendo el mismo
patrón de los archivos anteriores (ej. src/lib/actions/profile.ts).
```

**Con esto se completa el front-end visual de la Fase 1 completa.** El siguiente paso natural es decidir entre: (a) empezar los prompts de la Fase 2 (§3 — grupos, reacciones, estados, mensajes que desaparecen, etc.), o (b) trasladar el proyecto para arrancar la fase de back-end (§10). Dime cuál prefieres cuando confirmes que Perfil/Ajustes quedó listo.

---

## 17. Fase 2 — registro de avance

**Decisión (12 ago 2026):** se sigue construyendo en Lovable antes de pasar a back-end. Orden sugerido de los bloques de la Fase 2 (§3), uno por prompt, mismo ritmo que la Fase 1:

| Bloque | Estado | Notas |
|---|---|---|
| Chats grupales | ✅ Hecho (12 ago 2026) | Opción "Nuevo grupo" con selección múltiple, pantalla de nombre/foto, hilo grupal con nombre del remitente en cada burbuja y sin botón de llamada, detalle con Admin, agregar/quitar, salir y eliminar (con confirmación), avatares superpuestos + ícono de grupo en la lista. Acciones aisladas en `src/lib/actions/groups.ts`. |
| **Identidad visual propia (reskin violeta/índigo)** | ✅ Hecho (12 ago 2026) | Manrope, paleta violeta `#5B4FE5` + acento ámbar `#F5A623` (insignias, "escribiendo…", grabador con pulso), iconos Phosphor, burbujas de 20px sin cola con agrupación de mensajes consecutivos, estados vacíos con voz de copiloto. Verificado sin errores de consola. |
| Reacciones a mensajes + mensajes que desaparecen | ✅ Hecho (12 ago 2026) | Barra rápida + selector completo de emojis, insignias con contador en grupos, lista de quién reaccionó; interruptor 24h/7 días/90 días en info del chat y detalle del grupo, mensaje de sistema centrado, ícono de temporizador. Acciones aisladas en `chats.ts`. |
| Archivar / fijar / silenciar chats + búsqueda global | ✅ Hecho (12 ago 2026) | Fijar (máx. 3, con aviso), silenciar con duración (8h/1 semana/siempre), archivar con fila colapsable "Archivados (N)" y lista aparte, búsqueda global dentro del contenido de mensajes con fragmentos resaltados. Acciones aisladas en `chats.ts` (`pinChat`, `unpinChat`, `muteChat`, `unmuteChat`, `archiveChat`, `unarchiveChat`, `searchMessages`). |
| Compartir ubicación | ✅ Hecho (12 ago 2026) | Menú de adjuntos: "Ubicación actual" (tarjeta de mapa que abre Google Maps) y "Ubicación en tiempo real" (15 min/1h/8h) con insignia "En vivo", contador y banner superior con "Detener". Aislado en `chats.ts`. |
| Estados/Historias (24h) | ✅ Hecho (12 ago 2026) | Fila horizontal arriba de Chats con anillos violeta→ámbar, creador (texto con fondos de marca o foto con leyenda y selector de audiencia), visor a pantalla completa con barra segmentada, gestos y "Visto por N", respuestas que abren el chat 1 a 1 citando el estado. Aislado en `src/lib/actions/status.ts`. |

**Fase 2 (paridad extendida con WhatsApp) completa — 12 ago 2026.** Grupos, reacciones, mensajes que desaparecen, archivar/fijar/silenciar, búsqueda global, ubicación y Estados, más la pieza propia de conexión con la placa/dispositivo (§17.1) y el reskin visual violeta/índigo. Decisión pendiente: seguir con Fase 3 (VoIP real, conexión por proximidad) o trasladar el proyecto para arrancar el back-end.

**Nota (12 ago 2026, tarde):** el fundador pidió pausar aquí la paridad con WhatsApp y adelantar una pieza propia del producto (fuera de la lista de arriba, que es específicamente "paridad con WhatsApp"): la pantalla de conexión con la placa del casco. Ver §22 para el detalle de por qué esto es solo UI simulada por ahora, y el registro de esta pieza en la tabla siguiente.

### 17.1 Preparación para Fase 3 — conexión con dispositivo Bluetooth (casco)

| Bloque | Estado | Notas |
|---|---|---|
| Pantalla de emparejamiento Bluetooth (UI simulada) | ✅ Hecho (12 ago 2026) | Subpantalla "Casco / Dispositivo" en Perfil/Ajustes: flujo simulado buscar → emparejar → conectado (batería, señal), desconectar y olvidar con confirmación. Acciones aisladas en `src/lib/actions/device.ts`, marcadas con TODO para la integración real de Bluetooth LE cuando exista la placa. |

## 18. Prompt para pegar en Lovable — Fase 2: Chats grupales

Continúa en el mismo proyecto. Reutiliza el selector de contactos de la pestaña Contactos, el componente `DetailScreen`, y el componente de chat individual ya construido (§5.3) como base.

```
Ahora agreguemos chats grupales, reutilizando el componente de chat individual
que ya construiste como base, el selector de contactos de la pestaña Contactos,
y DetailScreen para las subpantallas. Sigue usando datos simulados.

CREAR GRUPO:
- Desde el botón "+" de la lista de chats, agrega la opción "Nuevo grupo" (además
  de "Nuevo chat" que ya existe).
- Selector múltiple de contactos (reutiliza el mismo componente de selección que
  ya existe, pero permitiendo elegir varios en vez de uno solo).
- Pantalla para poner nombre del grupo y foto de grupo opcional.

CHAT DE GRUPO (misma pantalla de chat individual, con estas diferencias):
- Encabezado: foto/ícono de grupo y nombre del grupo en vez de un contacto,
  con la cantidad de participantes debajo del nombre (ej. "Ricardo, Alejandra y
  3 más").
- En cada burbuja de mensaje ajena, mostrar el nombre de quién lo envió (esto
  no aplica en el chat 1 a 1, solo en grupo).
- El botón de llamada del encabezado no aplica a grupos en esta fase — ocúltalo
  o dejarlo deshabilitado.

DETALLE DEL GRUPO (al tocar el encabezado, usa DetailScreen):
- Foto y nombre del grupo (editables solo por el administrador).
- Lista de participantes, con etiqueta "Admin" junto a quien administra.
- Si el usuario es admin: botones para agregar participantes (reutiliza el
  selector de contactos) y quitar participantes.
- Botón "Salir del grupo" (cualquier miembro) y "Eliminar grupo" (solo admin),
  ambos con confirmación antes de ejecutar.

LISTA DE CHATS:
- Distingue visualmente un chat de grupo de uno individual (ícono de grupo o
  varias fotos superpuestas en vez de una sola foto de contacto).

Recuerda: cada acción (crear grupo, agregar/quitar participante, salir, eliminar
grupo) debe quedar como función aislada y reutilizable — puedes crear un archivo
nuevo src/lib/actions/groups.ts siguiendo el mismo patrón que chats.ts, notes.ts,
contacts.ts y profile.ts.
```

Cuando esto quede construido, seguimos con reacciones a mensajes y mensajes que desaparecen.

---

## 19. Prompt para pegar en Lovable — reskin: identidad visual propia (violeta/índigo)

Corresponde a §6.1. Se aplica a TODAS las pantallas ya construidas (onboarding, Chats, Notas, Contactos, Perfil, Grupos) — es un cambio transversal de sistema de diseño, no una pantalla nueva. A partir de aquí, cada prompt siguiente de la Fase 2 ya debe construirse directamente con esta identidad, sin necesidad de un reskin otra vez.

```
Vamos a reemplazar el sistema de diseño genérico por una identidad visual propia
en TODA la app ya construida (onboarding, Chats, Notas, Contactos, Perfil,
Grupos) — el objetivo explícito es que la app deje de parecerse a WhatsApp a
simple vista, aunque la funcionalidad sea similar.

COLOR:
- Color primario: #5B4FE5 (violeta-índigo). Reemplaza cualquier verde/azul
  genérico que hayas usado hasta ahora en botones, FAB, elementos activos de
  la barra de pestañas, enlaces, etc.
- Acento cálido, de uso escaso y deliberado: #F5A623 (ámbar) — solo para
  insignias de no leídos, indicadores "en vivo"/"escribiendo", y el botón de
  grabar nota de voz (con una animación de pulso sutil mientras se graba).
- Superficies neutras: #F1F0F7 (gris cálido claro) en modo claro, #17151F
  (gris carbón) en modo oscuro — no uses grises azulados genéricos.
- Los colores de estado del sistema (éxito, error, advertencia) se mantienen
  convencionales (verde/rojo/ámbar), no cambian.

BURBUJAS DE MENSAJE (Chats y Grupos):
- Quita el "pico"/cola de la burbuja — completamente redondeadas, radio ~20px.
- Burbuja propia: fondo sólido #5B4FE5, texto blanco.
- Burbuja ajena: fondo #F1F0F7 (o #2A2733 en modo oscuro), texto oscuro/claro
  según el modo — nunca blanco puro.
- Agrupa visualmente los mensajes consecutivos del mismo remitente (radio
  reducido entre burbujas contiguas del mismo emisor), en vez de repetir una
  burbuja completa con cola en cada mensaje.

TIPOGRAFÍA:
- Reemplaza la fuente del sistema por Manrope en toda la interfaz (títulos,
  cuerpo, mensajes) — impórtala como fuente web, no dependas de la fuente
  nativa de iOS/Android.

ICONOGRAFÍA:
- Cambia el set de iconos actual por Phosphor Icons, peso "regular" o
  "duotone" (terminales redondeadas) — no dejes iconos de dos sets distintos
  mezclados.

TOQUES DE MARCA:
- Revisa los textos de estados vacíos (lista de chats vacía, notas vacías,
  contactos vacíos) y dales personalidad propia relacionada con "copiloto"
  como asistente (ej. "Tu copiloto está listo" en vez de un texto genérico
  tipo "No tienes chats aún").
- No cambies la estructura de navegación (la barra inferior de 4 pestañas ya
  es intencionalmente distinta a WhatsApp, que separa el patrón entre iOS y
  Android) — este prompt es solo de color, forma, tipografía e iconografía,
  no de estructura.

Verifica al final que tanto modo claro como modo oscuro se vean bien con la
paleta nueva, y que el contraste de texto siga siendo alto (esto ya era un
requisito desde el sistema de diseño original).
```

Cuando esto quede aplicado en todas las pantallas, seguimos con reacciones a mensajes y mensajes que desaparecen (ya con la nueva identidad).

---

## 20. Prompt para pegar en Lovable — Fase 2: reacciones a mensajes + mensajes que desaparecen

Continúa en el mismo proyecto, ya con la identidad visual violeta/índigo aplicada (no hace falta repetirla). Aplica tanto a chats individuales como grupales.

```
Ahora agreguemos dos funciones sobre el chat que ya existe (individual y
grupal): reacciones a mensajes y mensajes que desaparecen. Sigue usando datos
simulados y mantén la identidad visual ya aplicada (violeta #5B4FE5, acento
ámbar #F5A623, burbujas sin cola, Manrope, iconos Phosphor).

REACCIONES A MENSAJES:
- Al mantener presionado un mensaje (propio o ajeno), muestra una barra rápida
  con 5-6 emojis comunes (👍 ❤️ 😂 😮 😢 🙏) más un botón "+" para abrir el
  selector completo de emojis.
- La reacción elegida aparece como una pequeña insignia en la esquina inferior
  de la burbuja, con el emoji y un contador si hay más de una persona
  reaccionando (esto último solo aplica en grupos).
- Tocar la insignia de reacciones muestra quién reaccionó y con qué (una lista
  simple, puede ser una hoja/modal, no hace falta DetailScreen completo aquí).
- Un usuario puede quitar su propia reacción tocándola de nuevo.

MENSAJES QUE DESAPARECEN:
- En el detalle del chat (individual, usa DetailScreen; o grupal, dentro del
  detalle del grupo que ya existe), agrega un interruptor "Mensajes que
  desaparecen" con opciones de duración: 24 horas / 7 días / 90 días.
- Al activarlo, inserta un mensaje de sistema centrado en el hilo (texto gris,
  sin burbuja) indicando el cambio, ej. "Activaste los mensajes que
  desaparecen. Los nuevos mensajes desaparecerán después de 24 horas." — igual
  patrón para cuando se desactiva.
- Los mensajes enviados mientras la opción está activa llevan un pequeño ícono
  de reloj/temporizador junto a la hora de envío.
- No hace falta que los mensajes desaparezcan de verdad en esta fase (no hay
  backend todavía) — con el interruptor funcional, el mensaje de sistema y el
  ícono de temporizador es suficiente para esta etapa visual.

Recuerda: cada acción (reaccionar, quitar reacción, activar/desactivar mensajes
que desaparecen) debe quedar como función aislada y reutilizable, siguiendo el
mismo patrón ya usado en chats.ts y groups.ts.
```

Cuando esto quede construido, seguimos con archivar/fijar/silenciar chats y la búsqueda global (§17).

---

## 21. Prompt para pegar en Lovable — Fase 2: archivar/fijar/silenciar chats + búsqueda global

Continúa en el mismo proyecto, misma identidad visual ya aplicada. Amplía la lista de chats (§5.2) que ya existe.

```
Ahora ampliemos la lista de chats con organización (archivar, fijar, silenciar)
y una búsqueda global de verdad (no solo filtrar la lista por nombre, sino
buscar dentro del contenido de los mensajes). Sigue usando datos simulados.

ARCHIVAR:
- Desde el gesto de deslizar sobre un chat (ya existe para silenciar/eliminar,
  agrégalo ahí) o desde un menú de mantener presionado, agrega la opción
  "Archivar".
- Los chats archivados no aparecen en la lista principal — en su lugar, arriba
  de la lista, muestra una fila colapsable "Archivados (N)" que al tocarla
  abre una lista aparte con esos chats (y la opción de desarchivar).

FIJAR:
- Opción "Fijar" en el mismo menú de deslizar/mantener presionado. Máximo 3
  chats fijados a la vez (si el usuario intenta fijar un cuarto, muestra un
  aviso simple pidiendo desfijar uno primero).
- Los chats fijados aparecen arriba de todos los demás en la lista, con un
  pequeño ícono de pin, ordenados por el momento en que se fijaron.

SILENCIAR:
- Opción "Silenciar" con duración: 8 horas / 1 semana / Siempre.
- Los chats silenciados muestran un ícono de campana tachada junto al nombre
  en la lista (no hace falta lógica real de notificaciones todavía, es solo
  el estado visual).

BÚSQUEDA GLOBAL:
- El buscador de la lista de chats (que ya existe filtrando por nombre) ahora
  también busca dentro del contenido de los mensajes de texto de todos los
  chats.
- Los resultados que vienen de contenido de mensaje (no de nombre de chat) se
  muestran agrupados por chat, con un fragmento de texto de contexto
  alrededor de la coincidencia.
- Tocar un resultado abre ese chat y hace scroll hasta el mensaje encontrado,
  resaltándolo brevemente.

Recuerda: cada acción (archivar, desarchivar, fijar, desfijar, silenciar,
buscar) debe quedar como función aislada y reutilizable en chats.ts, siguiendo
el mismo patrón que ya vienes usando.
```

Cuando esto quede construido, seguimos con compartir ubicación.

---

## 22. Prompt para pegar en Lovable — pantalla de conexión con la placa del casco (UI simulada)

**Contexto para ti antes de pegar esto:** confirmamos que hoy no existe una placa física ni especificaciones técnicas del fabricante — solo el contacto identificado (ficha original, §8). Sin hardware real ni protocolo documentado, no hay nada real que conectar todavía, y tampoco se puede probar Bluetooth de verdad dentro de la vista previa de Lovable (eso requeriría exportar con Capacitor, agregar un plugin de Bluetooth LE, compilar la app de verdad e instalarla en un teléfono junto al dispositivo físico — un flujo de prueba totalmente distinto al que hemos usado hasta ahora). Por eso este prompt construye **solo la experiencia visual del emparejamiento**, simulada de principio a fin, exactamente con la misma disciplina que el resto del front-end: cuando exista una placa real con su documentación, se reemplaza la simulación por el plugin de Bluetooth real sin tener que rediseñar nada, porque las acciones ya van a quedar aisladas.

Corresponde al "primer contacto" de emparejamiento descrito en la ficha original (§8). Vive como una nueva subpantalla dentro de Perfil/Ajustes, usando `DetailScreen`.

```
Agreguemos una nueva subpantalla en Perfil/Ajustes: "Casco / Dispositivo".
Usa DetailScreen y la identidad visual ya aplicada (violeta #5B4FE5, acento
ámbar #F5A623, Manrope, Phosphor). Todo esto es una SIMULACIÓN completa —
no hay ningún dispositivo Bluetooth real todavía, ni se debe usar ninguna
librería de Bluetooth real. Es solo la experiencia visual del flujo.

ESTADO "SIN DISPOSITIVO CONECTADO":
- Ilustración o ícono simple + texto con voz de copiloto (ej. "Conecta tu
  casco para manejar CoPiloto por voz" — aunque la voz todavía no exista,
  este texto ya construye la expectativa correcta del producto).
- Botón "Buscar dispositivos".

FLUJO DE EMPAREJAMIENTO (simulado):
- Al tocar "Buscar dispositivos", muestra una animación de "Buscando…" por
  un par de segundos (simulado con un temporizador, no una búsqueda real).
- Aparece una lista de 2-3 dispositivos de ejemplo (nombres tipo
  "CoPiloto-Casco-042", "CoPiloto-Casco-118") con ícono de señal Bluetooth.
- Al tocar uno, muestra "Emparejando…" con un indicador de progreso
  (simulado, ~2 segundos) y luego pasa al estado conectado.

ESTADO "CONECTADO":
- Tarjeta con el nombre del dispositivo emparejado, ícono de Bluetooth activo,
  nivel de batería simulado (ej. "82%") y una barra de señal simulada.
- Botón "Desconectar" (vuelve al estado sin dispositivo conectado, pero
  recordando el emparejamiento).
- Botón "Olvidar dispositivo" (con confirmación) que borra el emparejamiento
  por completo y vuelve al estado inicial "sin dispositivo".

Recuerda: cada acción (buscar, seleccionar dispositivo, conectar, desconectar,
olvidar) debe quedar como función aislada y reutilizable en un archivo nuevo,
ej. src/lib/actions/device.ts, con comentarios claros marcando que hoy son
simulaciones (ej. // TODO: reemplazar por integración real de Bluetooth LE
cuando exista la placa y su documentación) — así, cuando llegue el momento
real, se reemplaza la implementación interna de estas funciones sin tocar
la pantalla.
```

Cuando esto quede construido, retomamos donde íbamos: compartir ubicación (§17), y más adelante Estados/Historias para cerrar la Fase 2.

---

## 23. Prompt para pegar en Lovable — Fase 2: compartir ubicación

Continúa en el mismo proyecto, misma identidad visual ya aplicada. Amplía el botón de adjuntar del chat (§5.3), que ya tiene cámara/galería/documento.

```
Agreguemos "Ubicación" al botón de adjuntar del chat (junto a cámara, galería
y documento que ya existen). Sigue usando datos simulados — no hay integración
real de mapas ni GPS todavía, solo la experiencia visual.

AL TOCAR "UBICACIÓN":
- Muestra dos opciones: "Ubicación actual" y "Ubicación en tiempo real".

UBICACIÓN ACTUAL:
- Envía un mensaje especial en el chat: una tarjeta con una miniatura de mapa
  (puede ser una imagen estática de ejemplo, no hace falta un SDK de mapas
  real) y un pin en el centro, más una dirección de ejemplo debajo.
- Al tocar la tarjeta, simula abrir la app de Google Maps con esa ubicación
  (mismo patrón de deep link ya definido en la ficha original, §10.5 —
  "abrir Google Maps con la ruta lista" en vez de construir mapas propios).

UBICACIÓN EN TIEMPO REAL:
- Antes de enviar, pregunta la duración: 15 minutos / 1 hora / 8 horas.
- Envía una tarjeta similar a la de ubicación actual, pero con una etiqueta
  "En vivo" y un contador regresivo simulado.
- Mientras está "activa" (simulado), muestra un banner en la parte superior
  del chat: "Compartiendo tu ubicación en vivo" con un botón "Detener".
- Al tocar "Detener" o al llegar a cero el contador, la tarjeta pasa a mostrar
  "Ubicación en vivo finalizada".

Recuerda: cada acción (compartir ubicación actual, iniciar/detener ubicación
en vivo) debe quedar como función aislada y reutilizable en chats.ts, con el
mismo patrón que ya vienes usando.
```

Cuando esto quede construido, cerramos la Fase 2 con Estados/Historias (24h) — el bloque más grande e independiente de todos, así que conviene dejarlo para el final.

---

## 24. Prompt para pegar en Lovable — Fase 2: Estados/Historias (24h) — cierra la Fase 2

Continúa en el mismo proyecto, misma identidad visual ya aplicada. Es el bloque más grande de esta ronda — vive como una fila horizontal arriba de la lista de Chats, no como una pestaña nueva (mantenemos las 4 pestañas tal como están, es una diferenciación intencional ya documentada en §6.1).

```
Agreguemos Estados/Historias, la última pieza de la Fase 2. Vive como una fila
horizontal desplazable arriba de la lista de chats (no agregues una pestaña
nueva — las 4 pestañas actuales se quedan igual). Sigue usando datos
simulados, con la identidad visual ya aplicada (violeta #5B4FE5, ámbar
#F5A623, Manrope, Phosphor).

FILA DE ESTADOS (arriba de la lista de Chats):
- Primera burbuja: "Tu estado" — tu foto de perfil con un ícono "+" pequeño
  en la esquina para agregar uno nuevo.
- Después, burbujas de contactos con estados activos (últimas 24h simuladas),
  cada una con un anillo alrededor del avatar: anillo con degradado
  violeta→ámbar si no lo has visto, anillo gris si ya lo viste.

CREAR ESTADO (al tocar "Tu estado" con el +):
- Dos tipos: foto/video (simulado con una imagen de ejemplo, como si viniera
  de cámara o galería) o texto (fondo de color a elegir entre 4-5 opciones de
  la paleta de marca, con el texto centrado encima).
- Campo de texto opcional para agregar una leyenda sobre la foto/video.
- Selector de audiencia: "Todos mis contactos" / "Excepto…" / "Compartir
  solo con…" — reutiliza el selector de contactos que ya existe.
- Botón "Publicar".

VER UN ESTADO (al tocar la burbuja de un contacto):
- Pantalla completa, con una barra de progreso segmentada arriba (una por
  cada estado de esa persona, se llena automáticamente pasados unos
  segundos y avanza al siguiente).
- Tocar el lado derecho avanza, el lado izquierdo retrocede; mantener
  presionado pausa.
- Deslizar hacia abajo cierra el visor.
- Campo de texto abajo para "Responder" — al enviar, abre (o crea) el chat
  1 a 1 con esa persona con el mensaje, citando de qué estado es la
  respuesta.
- Si es TU propio estado: en vez del campo de responder, muestra "Visto por
  N" con la lista de quién lo vio al deslizar hacia arriba.

Recuerda: cada acción (publicar estado, ver estado, marcar como visto,
responder a un estado) debe quedar como función aislada y reutilizable —
crea un archivo nuevo src/lib/actions/status.ts siguiendo el mismo patrón
que ya vienes usando en los demás archivos de acciones.
```

**Con esto se completa toda la Fase 2** (paridad extendida con WhatsApp: grupos, reacciones, mensajes que desaparecen, archivar/fijar/silenciar, búsqueda global, ubicación, Estados) más la pieza propia de la placa/dispositivo (§22). El siguiente paso natural es decidir entre seguir sumando funciones (Fase 3: llamadas VoIP reales, conexión por proximidad — ver ficha original §10.9/§10.11) o trasladar el proyecto para arrancar el back-end real (§10). Dime cuál prefieres cuando confirmes que esto quedó listo.
