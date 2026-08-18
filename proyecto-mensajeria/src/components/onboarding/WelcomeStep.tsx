import { MessageCircle, NotebookPen, ShieldCheck } from "@/components/shared/icons";
import { PhoneScreen, PrimaryAction, ScreenFooter } from "@/components/shared/PhoneScreen";

const HIGHLIGHTS = [
  { icon: MessageCircle, label: "Chats con notas de voz, fotos y documentos" },
  { icon: NotebookPen, label: "Tu libreta personal de notas, siempre a mano" },
  { icon: ShieldCheck, label: "Verificación por celular y correo" },
];

export function WelcomeStep({ onStart }: { onStart: () => void }) {
  return (
    <PhoneScreen showThemeToggle>
      <div className="flex flex-1 flex-col justify-center px-7">
        <div className="mb-8 grid size-16 place-items-center rounded-3xl border border-border bg-accent">
          <MessageCircle className="size-8 text-accent-foreground" />
        </div>
        <h1 className="text-[34px] leading-[1.05] font-bold tracking-tight">
          Mensajes y notas,
          <br />
          en un solo lugar.
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">
          Habla con tus contactos, guarda tus ideas y mantén todo ordenado desde tu celular.
        </p>

        <ul className="mt-10 space-y-3">
          {HIGHLIGHTS.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5"
            >
              <Icon className="size-5 shrink-0 text-primary" />
              <span className="min-w-0 text-[15px]">{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <ScreenFooter>
        <PrimaryAction onClick={onStart}>Comenzar</PrimaryAction>
        <p className="pb-1 text-center text-[12px] leading-relaxed text-muted-foreground">
          Al continuar aceptas los Términos de servicio y la Política de privacidad.
        </p>
      </ScreenFooter>
    </PhoneScreen>
  );
}
