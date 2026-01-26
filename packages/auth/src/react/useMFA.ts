import { useCallback } from "react";

import type { MFASetupResult } from "../types";

export function useMFA() {
  const setupMFA = useCallback(async (): Promise<MFASetupResult> => {
    throw new Error("MFA setup requires Cognito adapter and active session");
  }, []);

  const verifyMFA = useCallback(
    async (_code: string, _session: string, _email: string): Promise<void> => {
      throw new Error("MFA verification not implemented");
    },
    [],
  );

  const disableMFA = useCallback(async (): Promise<void> => {
    throw new Error("MFA disable not implemented");
  }, []);

  return {
    setupMFA,
    verifyMFA,
    disableMFA,
  };
}
