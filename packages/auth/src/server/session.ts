import { getRequestProtocol, useSession } from '@tanstack/react-start/server';
import { env } from 'cloudflare:workers';

type SessionData = {
  userId?: string;
  email?: string;
  cognitoSession?: string;
  sessionToken?: string;
};

export function useAppSession(): ReturnType<typeof useSession<SessionData>> {
  const vars = env;

  // @ts-ignore
  if (!vars.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is not set');
  }

  return useSession<SessionData>({
    name: 'app-session',
    // @ts-ignore
    password: vars.SESSION_SECRET,
    cookie: {
      secure: getRequestProtocol() === 'https',
      sameSite: 'lax',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60,
    },
  });
}
