import { createRouter } from "@tanstack/react-router";

import { routeTree } from "@/routeTree.gen";
import { ErrorComponent } from "@/components/ErrorComponent";

let sentryInitPromise: Promise<void> | null = null;

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {
      head: "",
    },
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultPreloadStaleTime: 30_000,
    defaultStaleTime: 10_000,
    notFoundMode: "root",
    defaultErrorComponent: ({ error, reset }) => {
      return <ErrorComponent error={error} reset={reset} />;
    },
  });

  if (!import.meta.env.SSR && !sentryInitPromise) {
    sentryInitPromise = import("@sentry/react").then((Sentry) => {
      Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        environment: import.meta.env.MODE,
        release: import.meta.env.VITE_BUILD_ID,
        integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
        sampleRate: 1,
        enableLogs: false,
        tracesSampleRate: 0,
        beforeSend(event) {
          return event.exception?.values?.length ? event : null;
        },
        beforeSendTransaction() {
          return null;
        },
      });
    });
  }

  return router;
};
