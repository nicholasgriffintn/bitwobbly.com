import * as Sentry from "@sentry/react";
import { createRouter } from "@tanstack/react-router";

import { routeTree } from "@/routeTree.gen";
import { ErrorComponent } from "@/components/ErrorComponent";

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    notFoundMode: "root",
    defaultErrorComponent: ({ error, reset }) => {
      return <ErrorComponent error={error} reset={reset} />;
    },
  });

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_BUILD_ID,
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
    enableLogs: true,
    tracesSampleRate: 0.2,
  });

  return router;
};
