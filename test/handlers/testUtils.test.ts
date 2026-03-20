import { createPrivateKey } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createTestPrivateKey } from "./testUtils";

describe("test handler utilities", () => {
  it("generates a parseable RSA private key for the probot test harness", () => {
    const pem = createTestPrivateKey();

    expect(pem).toBe(createTestPrivateKey());
    expect(pem.startsWith("-----BEGIN ")).toBe(true);
    expect(pem.includes("PRIVATE KEY-----")).toBe(true);

    const key = createPrivateKey(pem);
    expect(key.asymmetricKeyType).toBe("rsa");
  });
});
