import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("../auth/auth.js", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => getSession(...args),
    },
  },
}));

vi.mock("../db/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/index.js")>();
  return {
    ...actual,
    invalidateDbCache: vi.fn(actual.invalidateDbCache),
  };
});

import { invalidateDbCache } from "../db/index.js";
import { DatabaseUnavailableError } from "../lib/db-errors.js";
import { getSessionUser } from "../lib/session.js";

describe("getSessionUser retry", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(invalidateDbCache).mockClear();
  });

  it("retries once after CONNECTION_ENDED and returns the session user", async () => {
    const ended = Object.assign(new Error("connection ended"), { code: "CONNECTION_ENDED" });
    getSession
      .mockRejectedValueOnce(ended)
      .mockResolvedValueOnce({ user: { id: "user_1", email: "a@example.com" } });

    const user = await getSessionUser(new Headers());
    expect(user).toMatchObject({ id: "user_1", email: "a@example.com" });
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(invalidateDbCache).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-infrastructure failures", async () => {
    getSession.mockRejectedValueOnce(new Error("unexpected auth failure"));

    await expect(getSessionUser(new Headers())).rejects.toThrow("unexpected auth failure");
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(invalidateDbCache).not.toHaveBeenCalled();
  });

  it("surfaces DatabaseUnavailableError when the retry also fails", async () => {
    const ended = Object.assign(new Error("connection ended"), { code: "CONNECTION_ENDED" });
    getSession.mockRejectedValueOnce(ended).mockRejectedValueOnce(ended);

    await expect(getSessionUser(new Headers())).rejects.toMatchObject({
      name: "DatabaseUnavailableError",
      kind: "reset",
    } satisfies Partial<DatabaseUnavailableError>);
    expect(getSession).toHaveBeenCalledTimes(2);
  });
});
