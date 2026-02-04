import type { AuthAdapter, AuthConfig } from "../types";
import { CustomAuthAdapter } from "../adapters/custom-adapter";
import { CognitoAuthAdapter } from "../adapters/cognito-adapter";

export function createAuthAdapter(config: AuthConfig): AuthAdapter {
  if (config.provider !== "custom" && config.provider !== "cognito") {
    throw new Error(`Unsupported AUTH_PROVIDER: ${config.provider}`);
  }

  if (config.provider === "cognito") {
    if (!config.cognito) {
      throw new Error(
        "Cognito configuration required when AUTH_PROVIDER=cognito"
      );
    }
    return new CognitoAuthAdapter({
      region: config.cognito.region,
      userPoolId: config.cognito.userPoolId,
      clientId: config.cognito.clientId,
      clientSecret: config.cognito.clientSecret,
      db: config.db,
      accessKeyId: config.cognito.accessKeyId,
      secretAccessKey: config.cognito.secretAccessKey,
    });
  }

  return new CustomAuthAdapter({ db: config.db });
}
