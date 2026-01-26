import { useSession } from '@tanstack/react-start/server';
import { env } from 'cloudflare:workers';

type SessionData = {
  userId?: string;
  email?: string;
};

export function useAppSession() {
  const vars = env;

  if (!vars.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is not set');
  }

  return useSession<SessionData>({
    name: 'app-session',
    password: vars.SESSION_SECRET,
    cookie: {
      secure: true,
      sameSite: 'lax',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60,
    },
  });
}
