import { describe, it, expect } from "vitest";

import {
  createWebAuthnRegistrationOptions,
  createWebAuthnAuthenticationOptions,
} from "./webauthn";

describe("webauthn helpers", () => {
  it("creates registration options with a challenge", async () => {
    const options = await createWebAuthnRegistrationOptions({
      rpId: "example.com",
      rpName: "Example",
      userId: "user-123",
      userName: "user@example.com",
    });

    expect(options.challenge).toBeTruthy();
    expect(options.rp.name).toBe("Example");
    expect(options.user.name).toBe("user@example.com");
  });

  it("creates authentication options with allow credentials", async () => {
    const options = await createWebAuthnAuthenticationOptions({
      rpId: "example.com",
      allowCredentials: ["dGVzdA"],
    });

    expect(options.challenge).toBeTruthy();
    expect(options.allowCredentials?.length).toBe(1);
  });
});
