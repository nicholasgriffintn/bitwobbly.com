import { useCallback } from "react";

import type { MFASetupResult } from "../types";

export function useMFA() {
  // TODO: This needs to be implemented for the custom and cognito adapters
  const setupMFA = useCallback(async (): Promise<MFASetupResult> => {
    throw new Error('MFA setup requires Cognito adapter and active session');
  }, []);

  // TODO: This needs to be implemented for the custom and cognito adapters
  const verifyMFA = useCallback(async (_code: string): Promise<void> => {
    throw new Error('MFA verification not implemented');
  }, []);

  // TODO: This needs to be implemented for the custom and cognito adapters
  const disableMFA = useCallback(async (): Promise<void> => {
    throw new Error('MFA disable not implemented');
  }, []);

  return {
    setupMFA,
    verifyMFA,
    disableMFA,
  };
}
