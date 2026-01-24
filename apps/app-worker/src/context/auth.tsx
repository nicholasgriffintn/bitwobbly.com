import {
  useContext,
  useState,
  useCallback,
  createContext,
  useMemo,
  useEffect,
  type ReactNode,
} from "react";
import {
  getCurrentUserFn,
  signInFn,
  signUpFn,
  signOutFn
} from "../server/functions/auth";

export type User = {
  id: string;
  email: string;
  teamId: string;
  createdAt: string;
};

export type AuthContextValue = {
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        setLoading(true);
        const currentUser = await getCurrentUserFn();
        if (currentUser) {
          setUser(currentUser);
        }
      } catch (err) {
        console.error("Session check failed", err);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      await signInFn({ data: { email, password } });
      const currentUser = await getCurrentUserFn();
      if (currentUser) {
        setUser(currentUser);
      }
    } catch (err: any) {
      if (err?.isRedirect) {
        throw err;
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      await signUpFn({ data: { email, password } });
      const currentUser = await getCurrentUserFn();
      if (currentUser) {
        setUser(currentUser);
      }
    } catch (err: any) {
      if (err?.isRedirect) {
        throw err;
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await signOutFn();
      setUser(null);
    } catch (err: any) {
      if (err?.isRedirect) {
        throw err;
      }
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, signIn, signUp, signOut, loading }),
    [user, signIn, signUp, signOut, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}
