import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppStoreProvider } from "@/store/AppStore";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no",
      },
      { title: "Vozz" },
      { name: "description", content: "Mensajes, notas de voz y contactos en tu celular." },
      { name: "author", content: "Vozz" },
      { name: "theme-color", content: "#17151F" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      // "Vozz" ya usaba `apple-mobile-web-app-capable`, pero le faltaba el
      // título específico que iOS muestra bajo el ícono al usar "Agregar a
      // inicio" (sin esto, cae al `<title>` completo de la pestaña) y el
      // modo de la barra de estado — agregado junto con `manifest.json`
      // porque las dos cosas habilitan lo mismo: que la app se pueda
      // "instalar" real desde Safari en iPhone (ver decisión de este día en
      // docs/decisions/README.md sobre TWA vs. PWA instalable).
      { name: "apple-mobile-web-app-title", content: "Vozz" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico?v=2", type: "image/x-icon" },
      // `manifest.json` es lo que le dice al navegador "esto se puede
      // instalar como app" — habilita "Agregar a inicio" real en iOS Safari
      // (ícono propio, pantalla completa sin la barra de Safari) y es
      // también el requisito real para empaquetar un TWA de Android más
      // adelante (Google exige un manifest válido con íconos 192/512 para
      // considerar la web app "instalable"). `apple-touch-icon` es el ícono
      // que iOS usa específicamente para "Agregar a inicio" — no lo toma
      // del `manifest.json` de forma confiable, hay que declararlo aparte.
      //
      // `?v=2` (2026-09-05, logo nuevo reemplazando el corazón de Lovable):
      // el nombre del archivo no cambió, así que el navegador/iOS puede
      // seguir sirviendo el PNG viejo desde caché aunque el archivo en el
      // servidor ya sea otro — el query string fuerza a tratarlo como un
      // recurso distinto. Subir este número cada vez que se reemplace el ícono.
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png?v=2" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AppStoreProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </AppStoreProvider>
    </QueryClientProvider>
  );
}
