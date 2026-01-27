import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

const DEFAULT_TIMEOUT_MS = 60000;

export type WebAuthnRegistrationOptions = Awaited<
  ReturnType<typeof generateRegistrationOptions>
>;
export type WebAuthnAuthenticationOptions = Awaited<
  ReturnType<typeof generateAuthenticationOptions>
>;

type RegistrationResponse = Parameters<
  typeof verifyRegistrationResponse
>[0]["response"];
type AuthenticationResponse = Parameters<
  typeof verifyAuthenticationResponse
>[0]["response"];

export async function createWebAuthnRegistrationOptions({
  rpId,
  rpName,
  userId,
  userName,
}: {
  rpId: string;
  rpName: string;
  userId: string;
  userName: string;
}): Promise<WebAuthnRegistrationOptions> {
  return generateRegistrationOptions({
    rpID: rpId,
    rpName,
    userID: isoBase64URL.toBuffer(userId),
    userName,
    attestationType: "none",
    timeout: DEFAULT_TIMEOUT_MS,
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
}

export async function createWebAuthnAuthenticationOptions({
  rpId,
  allowCredentials,
}: {
  rpId: string;
  allowCredentials: string[];
}): Promise<WebAuthnAuthenticationOptions> {
  return generateAuthenticationOptions({
    rpID: rpId,
    timeout: DEFAULT_TIMEOUT_MS,
    userVerification: "preferred",
    allowCredentials: allowCredentials.map((id) => ({
      id,
    })),
  });
}

export async function verifyWebAuthnAttestation({
  response,
  expectedChallenge,
  expectedOrigin,
  expectedRpId,
}: {
  response: RegistrationResponse;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRpId: string;
}): Promise<{
  credentialId: string;
  publicKey: string;
  counter: number;
}> {
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID: expectedRpId,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("WebAuthn registration not verified");
  }

  const { credentialID, credentialPublicKey, counter } =
    verification.registrationInfo;

  return {
    credentialId: credentialID,
    publicKey: isoBase64URL.fromBuffer(credentialPublicKey),
    counter,
  };
}

export async function verifyWebAuthnAssertion({
  response,
  expectedChallenge,
  expectedOrigin,
  expectedRpId,
  credential,
}: {
  response: AuthenticationResponse;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRpId: string;
  credential: {
    id: string;
    publicKey: string;
    counter: number;
  };
}): Promise<{ counter: number }> {
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID: expectedRpId,
    authenticator: {
      credentialID: credential.id,
      credentialPublicKey: isoBase64URL.toBuffer(credential.publicKey),
      counter: credential.counter,
    },
  });

  if (!verification.verified || !verification.authenticationInfo) {
    throw new Error("WebAuthn assertion not verified");
  }

  return { counter: verification.authenticationInfo.newCounter };
}
