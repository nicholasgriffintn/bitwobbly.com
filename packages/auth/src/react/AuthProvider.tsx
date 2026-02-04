import {
  useContext,
  useState,
  useCallback,
  createContext,
  useMemo,
  type ReactNode,
} from "react";

import type { MFASetupResult } from "../types";

export type AuthContextValue = {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    inviteCode: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
  setupMFA: () => Promise<MFASetupResult>;
  verifyMFASetup: (code: string) => Promise<void>;
  disableMFA?: () => Promise<void>;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export type SignInData = { email: string; password: string };
export type SignUpData = {
  email: string;
  password: string;
  inviteCode: string;
};

export type AuthProviderProps = {
  children: ReactNode;
  signInFn: (opts: { data: SignInData }) => Promise<unknown>;
  signUpFn: (opts: { data: SignUpData }) => Promise<unknown>;
  signOutFn: () => Promise<unknown>;
  setupMFAFn: () => Promise<unknown>;
  verifyMFASetupFn: (opts: { data: { code: string } }) => Promise<unknown>;
  disableMFAFn?: () => Promise<unknown>;
};

export function AuthProvider({
  children,
  signInFn,
  signUpFn,
  signOutFn,
  setupMFAFn,
  verifyMFASetupFn,
  disableMFAFn,
}: AuthProviderProps) {
  const [loading, setLoading] = useState(false);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      try {
        await signInFn({ data: { email, password } });
      } catch (err) {
        if (
          err &&
          typeof err === "object" &&
          ("isRedirect" in err || "isSerializedRedirect" in err)
        ) {
          throw err;
        }
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [signInFn]
  );

  const signUp = useCallback(
    async (email: string, password: string, inviteCode: string) => {
      setLoading(true);
      try {
        await signUpFn({ data: { email, password, inviteCode } });
      } catch (err) {
        if (
          err &&
          typeof err === "object" &&
          ("isRedirect" in err || "isSerializedRedirect" in err)
        ) {
          throw err;
        }
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [signUpFn]
  );

  const signOut = useCallback(async () => {
    try {
      await signOutFn();
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        ("isRedirect" in err || "isSerializedRedirect" in err)
      ) {
        throw err;
      }
    }
  }, [signOutFn]);

  const setupMFA = useCallback(async (): Promise<MFASetupResult> => {
    try {
      return (await setupMFAFn()) as MFASetupResult;
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        ("isRedirect" in err || "isSerializedRedirect" in err)
      ) {
        throw err;
      }
      throw err;
    }
  }, [setupMFAFn]);

  const verifyMFASetup = useCallback(
    async (code: string) => {
      try {
        await verifyMFASetupFn({ data: { code } });
      } catch (err) {
        if (
          err &&
          typeof err === "object" &&
          ("isRedirect" in err || "isSerializedRedirect" in err)
        ) {
          throw err;
        }
        throw err;
      }
    },
    [verifyMFASetupFn]
  );

  const disableMFA = useCallback(async () => {
    if (!disableMFAFn) {
      throw new Error("MFA disable not supported");
    }
    try {
      await disableMFAFn();
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        ("isRedirect" in err || "isSerializedRedirect" in err)
      ) {
        throw err;
      }
      throw err;
    }
  }, [disableMFAFn]);

  const value = useMemo<AuthContextValue>(
    () => ({
      signIn,
      signUp,
      signOut,
      setupMFA,
      verifyMFASetup,
      disableMFA: disableMFAFn ? disableMFA : undefined,
      loading,
    }),
    [
      signIn,
      signUp,
      signOut,
      setupMFA,
      verifyMFASetup,
      disableMFA,
      disableMFAFn,
      loading,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}
