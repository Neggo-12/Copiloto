# Copiloto versión 2 — carpeta organizada

**Fecha de reorganización:** 2026-09-02

Esta carpeta tenía software, hardware, imágenes de referencia y notas de
chat mezcladas en 9 archivos sueltos. Se separó todo por dominio para que,
cuando empecemos a construir, cada equipo (o cada sesión de trabajo) entre
directo a lo que le corresponde sin tener que releer todo.

## Estructura nueva

```
Copiloto version 2/
├── README.md                          ← este archivo
├── 00-vision-integral/                ← documentos que combinan hardware + software a propósito
│   ├── COPILOTO_2030_ARQUITECTURA_ESTRATEGICA_V1.docx
│   ├── COPILOTO_MASTER_SPECIFICATION_V1.docx
│   └── README.md
├── hardware/                          ← solo hardware
│   ├── HARDWARE_SPEC.md               ← spec limpia + precios reales + pinout GPIO
│   ├── COPILOTO_HARDWARE_SPECIFICATION_V1.docx  (original, se conserva)
│   └── referencias-visuales/          ← fotos de inspiración (NO son diseños propios)
│       ├── README.md
│       ├── casco.jpeg
│       ├── casco1.jpeg
│       ├── casco3.jpeg
│       ├── casco4.jpeg
│       ├── infografia-copiloto-device.png
│       ├── infografia-casco-premium.png
│       ├── concepto-casco-negro.png
│       └── casco-xray-forcite.png
├── software/                          ← solo software
│   └── SOFTWARE_ARCHITECTURE.md       ← arquitectura de backend, protocolo de dispositivo, roadmap de software
└── fuente-bruta-historica/            ← transcripciones crudas originales (no editar, solo consultar)
    ├── README.md
    ├── documento completo v2 contiene todo .md
    └── documento 2 completo con imagenes v2.md
```

## Qué pasó con los 9 archivos originales

| Archivo original | Dónde quedó |
| --- | --- |
| `COPILOTO_2030_ARQUITECTURA_ESTRATEGICA_V1.docx` | `00-vision-integral/` (se conserva íntegro, mezcla hardware+software a propósito) |
| `COPILOTO_MASTER_SPECIFICATION_V1.docx` | `00-vision-integral/` (idem) |
| `COPILOTO_HARDWARE_SPECIFICATION_V1.docx` | `hardware/` (se conserva íntegro) |
| `casco.jpeg`, `casco1.jpeg`, `casco3.jpeg`, `casco4.jpeg` | `hardware/referencias-visuales/` |
| `documento completo v2 contiene todo .md` | `fuente-bruta-historica/` |
| `documento 2 completo con imagenes v2.md` | `fuente-bruta-historica/` (nota: su texto es prácticamente duplicado del anterior — ver el README de esa carpeta) |

Además se crearon dos documentos nuevos, limpios y solo-de-su-dominio, que
extraen y organizan el contenido técnico disperso en las transcripciones
crudas: `hardware/HARDWARE_SPEC.md` y `software/SOFTWARE_ARCHITECTURE.md`.
Estos son los que deberíamos usar como referencia rápida de ahora en
adelante; los .docx y las transcripciones quedan como respaldo/fuente
original.

## Por qué `00-vision-integral/` no se dividió

`COPILOTO_2030_ARQUITECTURA_ESTRATEGICA_V1.docx` y
`COPILOTO_MASTER_SPECIFICATION_V1.docx` son documentos de **visión de
producto**, no specs técnicas puras: su valor está precisamente en mostrar
cómo el hardware y el software se conectan (arquitectura de capas,
roadmap conjunto, modos de uso, seguridad). Partirlos en dos le haría
perder esa narrativa. Se dejan íntegros como el documento de referencia
"de arriba hacia abajo"; `hardware/` y `software/` son la vista "de abajo
hacia arriba", ya separada, para cuando estemos construyendo cada parte.

## Siguiente paso

Con esto ya organizado, queda pendiente que definas qué construimos
primero: el prototipo de hardware (P0: ESP32 + audio + botones, ver
`hardware/HARDWARE_SPEC.md` sección 8) o alguna pieza del backend de
software (ver `software/SOFTWARE_ARCHITECTURE.md`).

---
*Reorganizado automáticamente a partir del contenido original — ningún
dato técnico (precios, GPIO, proveedores, presupuestos) fue inventado;
todo proviene de los 9 archivos originales, que se conservan intactos.*
