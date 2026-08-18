# Voice

Aún no implementado (el front-end construido en Lovable es 100% visual/mock, sin
integración de voz real todavía).

Visión y arquitectura funcional por niveles ya definidas:

- `docs/product/Ficha-04-CoPiloto.md` — visión original, niveles 1-3, prototipo con
  Shortcuts/Siri (§10).
- `docs/product/01_VISION_Y_CONTEXTO.md` y `docs/architecture/02_DOCUMENTO_MAESTRO_CLAUDE_CODE.md`
  — versión consolidada para la plataforma completa.
- `.claude/skills/puntos-movilidad-engineering/references/voice-assistant.md` —
  contrato técnico (Voice → Realtime/STT → Tool Call → Authorization → Application
  Service → Domain → Result → Voice).

Regla vigente: sin wake word permanente ni micrófono en segundo plano; solo durante
sesión de voz explícita en Modo Conducción (`CLAUDE.md` §6).
