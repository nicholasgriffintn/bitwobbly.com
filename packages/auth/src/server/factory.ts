import type { AuthAdapter, AuthConfig } from '../types';
import { CustomAuthAdapter } from '../adapters/custom-adapter';
import { CognitoAuthAdapter } from '../adapters/cognito-adapter';

export function createAuthAdapter(config: AuthConfig): AuthAdapter {
  if (config.provider === 'cognito') {
    if (!config.cognito) {
      throw new Error(
        'Cognito configuration required when AUTH_PROVIDER=cognito',
      );
    }
    return new CognitoAuthAdapter({
      region: config.cognito.region,
      userPoolId: config.cognito.userPoolId,
      clientId: config.cognito.clientId,
      db: config.db,
    });
  }

  return new CustomAuthAdapter({ db: config.db });
}
