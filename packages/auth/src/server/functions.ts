import type { AuthAdapter } from "../types";
import { useAppSession } from "./session";

export async function signUpHandler(
  adapter: AuthAdapter,
  requiredInviteCode: string,
  data: {
    email: string;
    password: string;
    inviteCode: string;
  },
) {
  if (data.inviteCode !== requiredInviteCode) {
    throw new Error('Invalid invite code');
  }

  const { user } = await adapter.signUp(data);

  await adapter.createSession(user.id);

  const session = await useAppSession();

  await session.update({ userId: user.id, email: user.email });

  return {
    user,
  };
}

export async function signInHandler(
  adapter: AuthAdapter,
  data: {
    email: string;
    password: string;
  },
) {
  const result = await adapter.signIn(data);

  if (result.requiresMFA) {
    return { requiresMFA: true, session: result.session };
  }

  await adapter.createSession(result.user.id);

  const session = await useAppSession();
  await session.update({
    userId: result.user.id,
    email: result.user.email,
  });

  return { requiresMFA: false, session: result.session };
}

export async function signOutHandler() {
  const session = await useAppSession();
  await session.clear();

  return;
}

export async function getCurrentUserHandler(adapter: AuthAdapter) {
  const session = await useAppSession();
  const userId = session.data.userId;
  if (!userId) {
    return null;
  }
  return await adapter.getUserById(userId);
}
