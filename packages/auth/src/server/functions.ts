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

  const result = await adapter.signUp(data);

  const session = await useAppSession();

  if (
    'requiresEmailVerification' in result &&
    result.requiresEmailVerification
  ) {
    await session.update({
      email: result.user.email,
      sessionToken: undefined,
      userId: undefined,
    });
    return result;
  }

  const { sessionToken } = await adapter.createSession(result.user.id);
  await session.update({
    userId: result.user.id,
    email: result.user.email,
    sessionToken,
  });

  return result;
}

export async function signInHandler(
  adapter: AuthAdapter,
  data: {
    email: string;
    password: string;
  },
) {
  const result = await adapter.signIn(data);

  const session = await useAppSession();

  if ("requiresMFA" in result) {
    await session.update({
      email: result.email,
      cognitoSession: result.session,
      sessionToken: undefined,
      userId: undefined,
    });
    return { requiresMFA: true, session: result.session, email: result.email };
  }

  if ("requiresMFASetup" in result) {
    await session.update({
      email: result.email,
      cognitoSession: result.session,
      sessionToken: undefined,
      userId: undefined,
    });
    return {
      requiresMFASetup: true,
      session: result.session,
      email: result.email,
      challengeParameters: result.challengeParameters,
    };
  }

  if ("requiresEmailVerification" in result) {
    await session.update({
      email: result.email,
      sessionToken: undefined,
      userId: undefined,
    });
    return { requiresEmailVerification: true, email: result.email };
  }

  if ("requiresPasswordReset" in result) {
    await session.update({
      email: result.email,
      sessionToken: undefined,
      userId: undefined,
    });
    return { requiresPasswordReset: true, email: result.email };
  }

  if ("requiresNewPassword" in result) {
    await session.update({
      email: result.email,
      cognitoSession: result.session,
      sessionToken: undefined,
      userId: undefined,
    });
    return {
      requiresNewPassword: true,
      session: result.session,
      email: result.email,
    };
  }

  if ("unsupportedChallenge" in result) {
    await session.update({
      email: result.email,
      cognitoSession: result.session,
      sessionToken: undefined,
      userId: undefined,
    });
    return {
      unsupportedChallenge: true,
      challengeName: result.challengeName,
      email: result.email,
    };
  }

  const { sessionToken } = await adapter.createSession(result.user.id);

  await session.update({
    userId: result.user.id,
    email: result.user.email,
    sessionToken,
  });

  return { success: true, session: result.session };
}

export async function signOutHandler(adapter?: AuthAdapter) {
  const session = await useAppSession();
  const sessionToken = session.data.sessionToken;

  if (adapter && sessionToken) {
    try {
      await adapter.deleteSession(sessionToken);
    } catch {
      // Ignore deletion errors during sign-out; cookie state is still cleared.
    }
  }

  await session.clear();

  return;
}

export async function getCurrentUserHandler(adapter: AuthAdapter) {
  const session = await useAppSession();
  const userId = session.data.userId;
  const sessionToken = session.data.sessionToken;

  if (!userId) {
    return null;
  }

  if (!sessionToken) {
    const created = await adapter.createSession(userId);
    await session.update({
      userId,
      email: session.data.email,
      cognitoSession: session.data.cognitoSession,
      sessionToken: created.sessionToken,
    });
  } else {
    const valid = await adapter.validateSession(sessionToken);
    if (!valid || valid.userId !== userId) {
      await session.clear();
      return null;
    }
  }

  return await adapter.getUserById(userId);
}

export async function verifyMFAHandler(adapter: AuthAdapter, code: string) {
  const session = await useAppSession();
  const cognitoSession = session.data.cognitoSession;
  const email = session.data.email;

  if (!cognitoSession || !email) {
    throw new Error("MFA session not found");
  }

  if (!adapter.verifyMFA) {
    throw new Error("MFA not supported by this adapter");
  }

  const { user } = await adapter.verifyMFA({
    session: cognitoSession,
    code,
    email,
  });

  const { sessionToken } = await adapter.createSession(user.id);
  await session.update({
    userId: user.id,
    email: user.email,
    cognitoSession: undefined,
    sessionToken,
  });

  return { user };
}

export async function setupMFAHandler(adapter: AuthAdapter) {
  const session = await useAppSession();
  const cognitoSession = session.data.cognitoSession;
  const email = session.data.email;

  if (!cognitoSession || !email) {
    throw new Error("MFA session not found");
  }

  if (!adapter.setupMFA) {
    throw new Error("MFA setup not supported by this adapter");
  }

  const result = await adapter.setupMFA({ session: cognitoSession, email });

  if (result.session && result.session !== cognitoSession) {
    await session.update({ cognitoSession: result.session, email });
  }

  return result;
}

export async function verifyMFASetupHandler(
  adapter: AuthAdapter,
  code: string,
) {
  const session = await useAppSession();
  const cognitoSession = session.data.cognitoSession;
  const email = session.data.email;

  if (!cognitoSession || !email) {
    throw new Error("MFA session not found");
  }

  if (!adapter.verifyMFASetup) {
    throw new Error("MFA setup verification not supported by this adapter");
  }

  const { user } = await adapter.verifyMFASetup({
    session: cognitoSession,
    code,
    email,
  });

  const { sessionToken } = await adapter.createSession(user.id);
  await session.update({
    userId: user.id,
    email: user.email,
    cognitoSession: undefined,
    sessionToken,
  });

  return { user };
}

export async function newPasswordHandler(
  adapter: AuthAdapter,
  newPassword: string,
) {
  const session = await useAppSession();
  const cognitoSession = session.data.cognitoSession;
  const email = session.data.email;

  if (!cognitoSession || !email) {
    throw new Error("New password session not found");
  }

  if (!adapter.completeNewPasswordChallenge) {
    throw new Error("New password challenge not supported by this adapter");
  }

  const { user } = await adapter.completeNewPasswordChallenge({
    session: cognitoSession,
    email,
    newPassword,
  });

  const { sessionToken } = await adapter.createSession(user.id);
  await session.update({
    userId: user.id,
    email: user.email,
    cognitoSession: undefined,
    sessionToken,
  });

  return { user };
}

export async function verifyEmailHandler(
  adapter: AuthAdapter,
  code: string,
  email?: string,
) {
  if (!email) {
    const session = await useAppSession();
    email = session.data.email;
  }

  if (!email) {
    throw new Error("Email not found in session");
  }

  if (!adapter.verifyEmail) {
    throw new Error("Email verification not supported by this adapter");
  }

  await adapter.verifyEmail(code, email);
}

export async function resendVerificationCodeHandler(
  adapter: AuthAdapter,
  email?: string,
) {
  if (!email) {
    const session = await useAppSession();
    email = session.data.email;
  }

  if (!email) {
    throw new Error("Email not found in session");
  }

  if (!adapter.resendVerificationCode) {
    throw new Error(
      "Resending verification code not supported by this adapter",
    );
  }

  await adapter.resendVerificationCode(email);
}

export async function forgotPasswordHandler(
  adapter: AuthAdapter,
  email: string,
) {
  if (!adapter.forgotPassword) {
    throw new Error("Forgot Password not supported by this adapter");
  }

  await adapter.forgotPassword(email);
}

export async function resetPasswordHandler(
  adapter: AuthAdapter,
  input: { email?: string; code: string; newPassword: string },
) {
  let email = input.email;

  if (!email) {
    const session = await useAppSession();
    email = session.data.email;
  }

  if (!email) {
    throw new Error("Email not found in session");
  }

  if (!adapter.confirmForgotPassword) {
    throw new Error("Reset Password not supported by this adapter");
  }

  await adapter.confirmForgotPassword({
    email,
    code: input.code,
    newPassword: input.newPassword,
  });
}
