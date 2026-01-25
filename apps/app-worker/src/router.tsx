import * as Sentry from "@sentry/react";
import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    notFoundMode: "root",
  });

  Sentry.init({
    dsn: 'https://ff9b8d6c174c4aaa90ddaa53a5fe178d@ingest.bitwobbly.com/1',
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_BUILD_ID,
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
    enableLogs: true,
    tracesSampleRate: 0.2,
  });

  return router;
};
