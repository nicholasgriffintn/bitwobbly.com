import {
  useContext,
  useState,
  useCallback,
  createContext,
  useMemo,
  type ReactNode,
} from "react";

export type AuthContextValue = {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    inviteCode: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
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
};

export function AuthProvider({
  children,
  signInFn,
  signUpFn,
  signOutFn,
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
    [signInFn],
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
    [signUpFn],
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

  const value = useMemo<AuthContextValue>(
    () => ({ signIn, signUp, signOut, loading }),
    [signIn, signUp, signOut, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}
