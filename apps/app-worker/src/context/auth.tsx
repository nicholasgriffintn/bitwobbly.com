import {
  useContext,
  useState,
  useCallback,
  createContext,
  useMemo,
  type ReactNode,
} from "react";
import { signInFn, signUpFn, signOutFn } from '../server/functions/auth';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(false);

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      await signInFn({ data: { email, password } });
    } catch (err) {
      if (err && typeof err === "object" && "isRedirect" in err) {
        throw err;
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, inviteCode: string) => {
      setLoading(true);
      try {
        await signUpFn({
          data: { email, password, inviteCode },
        });
      } catch (err) {
        if (err && typeof err === "object" && "isRedirect" in err) {
          throw err;
        }
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      await signOutFn();
    } catch (err) {
      if (err && typeof err === "object" && "isRedirect" in err) {
        throw err;
      }
    }
  }, []);

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
