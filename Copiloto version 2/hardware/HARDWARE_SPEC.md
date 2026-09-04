# Copiloto — especificación de hardware (V1, consolidada)

Solo hardware. Para cómo esto se conecta con el backend/app, ver
`../software/SOFTWARE_ARCHITECTURE.md`. Fuente: `COPILOTO_HARDWARE_SPECIFICATION_V1.docx`
más los precios, proveedores y pinout reales encontrados en
`../fuente-bruta-historica/documento completo v2 contiene todo .md`.

## 1. Decisión técnica clave

El controlador de audio/Bluetooth debe ser un **ESP32 clásico
(ESP32-WROOM-32), no el ESP32-S3**. El S3 solo trae Bluetooth LE; para
HFP (perfil manos libres: micrófono + audio con el teléfono) y A2DP se
necesita Bluetooth Classic, que Espressif documenta explícitamente para
el ESP32 clásico (rol HFP Client frente a un smartphone).

## 2. Arquitectura modular

- **Módulo A — Audio/Bluetooth:** ESP32-WROOM-32 + HFP/A2DP + micrófono + amplificador + parlantes.
- **Módulo B — Sensores:** IMU + batería + temperatura + botones.
- **Módulo C — Cámaras:** procesador/encoder dedicado, **separado a propósito** del ESP32 de audio (ver sección 5).
- **Módulo D — Almacenamiento:** microSD.
- **Módulo E — Energía:** Li-Po + cargador + protección + regulación.
- **Módulo F — Car Hub:** variante 12 V con micrófonos y conectividad vehicular (ver sección 8).

La separación entre audio/sensores (ESP32) y cámaras/visión (Raspberry Pi)
es deliberada: no se recomienda conectar las cuatro cámaras directamente
al ESP32 de audio.

## 3. Diagrama de bloques — Copiloto Helmet V1

```
                SMARTPHONE (Copiloto App)
                 GPS / IA / Internet
                        │
                 Bluetooth Classic
                        │
                        ▼
                ESP32-WROOM-32
          HFP / A2DP · Botones · IMU · Telemetría
                 │              │
            I2S Audio          I²C
                 │              │
           MAX98357A        MPU6050
                 │
          Parlantes L/R

        VISION CONTROLLER (independiente)
           Raspberry Pi Zero 2 W
   Cámara frontal · trasera · lateral L/R
        Grabación circular · microSD
```

El Raspberry Pi Zero 2 W (65×30 mm, CPU ARM quad-core, Wi-Fi, Bluetooth,
microSD, CSI-2 para cámara) es el "cerebro de visión", desacoplado del
ESP32 de audio/sensores.

## 4. Lista de componentes — prototipo de casco (precios reales observados en Medellín, sep. 2026)

| Componente | Referencia | Cant. | Precio observado | Notas |
| --- | --- | --- | --- | --- |
| MCU/Bluetooth | ESP32-WROOM-32 DevKit | 1 | $27.000–$38.000 COP (Robot Electronica: $37.527) | Bluetooth Classic, HFP + A2DP |
| IMU | MPU6050 | 1 | $13.000–$15.000 COP (zamux.co: $14.900) | 6 ejes; ICM-42688 como upgrade futuro |
| Micrófono | INMP441 I2S MEMS | 1 | ~$19.000 COP (MercadoLibre: $18.955) | Ideal escalar a 2-3 para beamforming |
| Amplificador | MAX98357A I2S | 1 | $14.500–$18.000 COP (MercadoLibre: $14.550) | |
| Parlantes | Planos 4 Ω / 3 W | 2 | $20.000–$40.000 COP el par | Delgados, cerca del oído sin bloquear sonido ambiente |
| Vision Controller | Raspberry Pi Zero 2 W | 1 | ~$145.500 COP en RoosTech (suele agotarse), más caro en MercadoLibre | Cerebro de visión, separado del ESP32 |
| Batería | Li-Po 3.7 V 2000-3000 mAh | 1 | $25.000–$50.000 COP | No definir el modelo final sin medir consumo real primero |
| Cargador | TP4056 con protección | 1 | $3.000–$7.000 COP | USB-C en versión final |
| Regulador | Buck/boost/LDO | 1 | $5.000–$15.000 COP | Según consumo |
| Botones | Táctiles sellados | 3-4 | $3.000–$8.000 COP c/u | Copiloto / SOS / Evento / Multimedia |
| LED | RGB | 1 | $1.000–$3.000 COP | Estado del dispositivo |
| microSD | 32-256 GB High Endurance | 1 | $178.000–$200.000 COP (256 GB) | Video |
| PCB prototipo | — | 1 | $15.000–$40.000 COP | Primero modular, luego propia |
| Carcasa | 3D print/ABS | 1 | $15.000–$40.000 COP | Objetivo IP54 |
| Cableado | JST + flexible + protoboard | — | $10.000–$40.000 COP | Conectores seguros |

**Presupuesto total estimado del primer prototipo completo (audio + IMU +
1 cámara + Raspberry Pi):** aproximadamente **$765.000–$1.100.000+ COP**
— el rango es amplio a propósito porque las cámaras y el adaptador
multi-cámara son la variable de costo más grande, todavía sin cotizar.

Un **MVP mínimo (solo audio manos libres, sin cámaras ni Raspberry Pi)**
puede hacerse con **$150.000–$220.000 COP**: es el paso P0, ver sección 8.

## 5. Cámaras

| Posición | Objetivo | Prioridad |
| --- | --- | --- |
| Frontal | 1080p/30 mínimo, evolución a 2K | V1 |
| Trasera | 1080p/30 gran angular | V1 |
| Lateral izquierda | 1080p/30 gran angular, puntos ciegos | V2 |
| Lateral derecha | 1080p/30 gran angular, puntos ciegos | V2 |

Grabación circular local con protección automática del clip previo/
posterior a un evento (accidente, SOS, o solicitud del usuario). El
streaming en vivo debe ser selectivo (por evento o sesión autorizada), no
continuo — cuatro cámaras transmitiendo todo el tiempo dispara consumo,
datos y temperatura.

## 6. Pinout ESP32 — prototipo de laboratorio

> Esta asignación es para el prototipo de banco de pruebas. Antes de
> soldar la versión definitiva hay que verificar el pinout exacto de la
> placa concreta (los DevKit/clones varían), y confirmar que GPIO25 no
> quede compartido entre el I2S del micrófono (WS) y el del amplificador
> (LRC) en la placa real.

**I²C — MPU6050 (IMU)**
```
ESP32                MPU6050
GPIO21  ──────────── SDA
GPIO22  ──────────── SCL
3.3V    ──────────── VCC
GND     ──────────── GND
```

**I2S — INMP441 (micrófono)**
```
ESP32                 INMP441
GPIO26 ────────────── SCK
GPIO25 ────────────── WS
GPIO33 ────────────── SD
3.3V   ────────────── VDD
GND    ────────────── GND
```

**I2S — MAX98357A (amplificador)**
```
ESP32                 MAX98357A
GPIO27 ────────────── BCLK
GPIO25 ────────────── LRC
GPIO32 ────────────── DIN
3.3V   ────────────── VIN
GND    ────────────── GND
```

**Botones**
```
GPIO4  → COPILOTO
GPIO16 → SOS
GPIO17 → EVENTO
GPIO18 → MULTIMEDIA
```
Cada botón: GPIO → botón → GND, con pull-up.

## 7. Car Hub

| Elemento | Función | V1 |
| --- | --- | --- |
| MCU/Bluetooth | Conexión con teléfono | Sí |
| Micrófonos | Voz de cabina | 2-4 |
| Audio | Bluetooth/AUX/USB | Sí |
| Entrada 12 V | Alimentación protegida | Sí |
| IMU | Eventos | Opcional |
| GPS | Redundancia | Opcional |
| CAN Bus | Telemetría | Solo lectura, fases futuras |
| USB-C | Servicio/actualización | Sí |
| SOS | Emergencia | Opcional |

Alimentación: 12 V del vehículo → protección contra transitorios → DC/DC
automotriz → 5 V/3.3 V → MCU/audio. Falta validar fusible, polaridad,
temperatura, EMI/EMC y comportamiento durante arranque en el diseño
final. **No escribir en CAN Bus en las primeras versiones** — comenzar
con lectura controlada únicamente.

## 8. Fases de prototipo

| Prototipo | Hardware | Meta |
| --- | --- | --- |
| P0 | ESP32 + audio + botones | Hablar/escuchar |
| P1 | P0 + IMU + batería | Accidente/SOS |
| P2 | P1 + cámara frontal/trasera | Grabación |
| P3 | P2 + laterales + microSD | Cobertura 360° |
| P4 | Car Hub | Integración sin pantalla nueva |
| P5 | PCB propia + carcasa | Piloto |

## 9. Diseño físico y seguridad

- No modificar elementos estructurales del casco sin validación del fabricante; no perforar el EPS.
- Usar módulos externos desmontables.
- Micrófonos cerca de la boca con protección contra viento.
- Parlantes cerca de los oídos sin bloquear totalmente el sonido ambiente.
- Batería aislada y protegida.
- Las cámaras no deben crear puntos peligrosos de enganche o impacto.

## 10. Firmware

- Identidad única de dispositivo.
- Estado de batería y conectividad.
- Eventos de botones e IMU.
- Estado HFP/audio.
- Watchdog.
- Actualización OTA y firmware firmado en versiones comerciales.

## 11. Dónde comprar en Medellín

| Tienda | Zona | Contacto |
| --- | --- | --- |
| ROOSTECH ELECTRÓNICA | La Candelaria / Centro Comercial La Cascada | 322 4647265 |
| Suconel | Centro Comercial La Cascada | (604) 4487830 |
| BIGTRONICA | Centro Comercial La Cascada | — |
| Didacticas Electronicas, Electronicas I+D — Sede Suramericana | Laureles/Suramericana | (604) 3225071 |
| Didacticas Electronicas, Electronicas I+D — Sede Cascada | Centro Comercial La Cascada | (604) 6073333 |
| Compel S.A. | Belén | (604) 3515900 |

Punto de partida recomendado: **Centro Comercial La Cascada** (reúne
ROOSTECH, Suconel y BIGTRONICA) para hacer la primera compra física y
comparar precios en persona. El ESP32-WROOM-32, el MPU6050, el INMP441 y
el MAX98357A también se consiguen online (Robot Electronica, zamux.co,
MercadoLibre) a precios similares o algo menores.

## 12. Próximo paso de hardware

Construir **P0** (ESP32 + micrófono + amplificador + parlantes + botones,
sin IMU ni cámaras todavía) y validar el flujo más básico: hablar → el
teléfono recibe la voz → Copiloto procesa → responde → se escucha la
respuesta en el casco. Presupuesto de este primer paso: **$150.000–
$220.000 COP**.
