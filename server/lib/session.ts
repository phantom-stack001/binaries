import { auth } from "../auth/auth.js";
import { invalidateDbCache } from "../db/index.js";
import {
  captureDatabaseFailures,
  classifyDatabaseError,
  DatabaseUnavailableError,
  peekDatabaseFailure,
  type DatabaseFailureKind,
} from "../lib/db-errors.js";
import { withDatabaseDeadline } from "../lib/database-deadline.js";

const RETRYABLE_KINDS = new Set<DatabaseFailureKind>(["reset", "timeout"]);

async function readSessionUser(headers: Headers) {
  return captureDatabaseFailures(async () => {
    try {
      const session = await auth.api.getSession({ headers });
      if (!session?.user) return null;
      return session.user;
    } catch (error) {
      const failure = peekDatabaseFailure() ?? classifyDatabaseError(error);
      if (failure) throw new DatabaseUnavailableError(failure.kind);
      throw error;
    }
  });
}

async function readSessionUserWithDeadline(headers: Headers) {
  return withDatabaseDeadline(() => readSessionUser(headers), "session");
}

export async function getSessionUser(headers: Headers) {
  try {
    return await readSessionUserWithDeadline(headers);
  } catch (error) {
    if (!(error instanceof DatabaseUnavailableError) || !RETRYABLE_KINDS.has(error.kind)) {
      throw error;
    }
    // Timeout path already invalidated inside withDatabaseDeadline.
    if (error.kind === "reset") invalidateDbCache();
    return readSessionUserWithDeadline(headers);
  }
}
