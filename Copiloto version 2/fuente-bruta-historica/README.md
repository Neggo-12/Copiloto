# Fuente bruta histórica — no editar, solo consultar

Estos dos archivos son transcripciones crudas del brainstorm original
(chat sin editar). Ya fueron leídos por completo y su contenido técnico
útil está extraído y organizado en `../hardware/HARDWARE_SPEC.md` y
`../software/SOFTWARE_ARCHITECTURE.md`. Se conservan aquí como respaldo
del "por qué" de cada decisión (quedan matices de la conversación que no
entraron en los documentos limpios) y porque tienen algunos datos
puntuales muy específicos (precios exactos con fecha de observación,
direcciones y teléfonos de tiendas, pinout GPIO) que conviene poder
verificar contra el original.

## Relación entre los dos archivos

- **`documento completo v2 contiene todo .md`** (3024 líneas) es la
  transcripción más completa: incluye la decisión ESP32-S3-vs-clásico, la
  lista de tiendas en Medellín, el presupuesto MVP, el diseño electrónico
  detallado del Helmet V1 (componentes exactos, precios, pinout GPIO,
  protocolo de dispositivo, flujo de accidente, grabación circular,
  comunicación entre usuarios) y el presupuesto completo del prototipo.

- **`documento 2 completo con imagenes v2.md`** (797 líneas) es en su
  mayor parte un **subconjunto redundante** del archivo anterior — su
  texto (líneas 98-786) es casi idéntico a las líneas 1638-2331 del
  documento completo (la sección filosófica sobre "Copiloto no debería
  competir contra el celular" y el ecosistema Wear/Car/Cloud), confirmado
  por diff línea por línea. **No** incluye la sección de diseño
  electrónico detallado del Helmet V1.

  Su valor único son las **imágenes incrustadas**: 2 infografías propias
  de Copiloto (ya extraídas a
  `../hardware/referencias-visuales/infografia-copiloto-device.png` e
  `infografia-casco-premium.png`) más 2 renders de casco de terceros (ya
  extraídos a `../hardware/referencias-visuales/concepto-casco-negro.png`
  y `casco-xray-forcite.png`).

## Si necesitas releer el original

Toda cifra de precio, GPIO y proveedor en `HARDWARE_SPEC.md` viene
textualmente de `documento completo v2 contiene todo .md` (secciones
"Diseño electrónico" y "Dónde comprar en Medellín" — buscar por
`GPIO`, `COPILOTO DEVICE PROTOCOL` o los nombres de las tiendas para
ubicarlas rápido).
