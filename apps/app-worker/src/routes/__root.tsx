import {
  HeadContent,
  Scripts,
  createRootRoute,
  Outlet,
  Link,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { AuthProvider } from "@bitwobbly/auth/react";

import {
  signInFn,
  signUpFn,
  signOutFn,
  setupMFAFn,
  verifyMFASetupFn,
} from "@/server/functions/auth";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "BitWobbly",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  component: RootDocument,

  notFoundComponent: NotFound,
});

function RootDocument() {
  const signIn = useServerFn(signInFn);
  const signUp = useServerFn(signUpFn);
  const signOut = useServerFn(signOutFn);
  const setupMFA = useServerFn(setupMFAFn);
  const verifyMFASetup = useServerFn(verifyMFASetupFn);

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <AuthProvider
          signInFn={signIn}
          signUpFn={signUp}
          signOutFn={signOut}
          setupMFAFn={setupMFA}
          verifyMFASetupFn={verifyMFASetup}
        >
          <Outlet />
        </AuthProvider>
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <div className="auth">
      <div className="auth-card">
        <h1>404 - Page not found</h1>
        <p>The page you're looking for doesn't exist.</p>
        <Link to="/">
          <button type="button">Go home</button>
        </Link>
      </div>
    </div>
  );
}
