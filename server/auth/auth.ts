import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { admin, haveIBeenPwned, twoFactor } from "better-auth/plugins";

import { sendstackAccessControl, sendstackAdminRoles } from "./access.js";
import { createLiveDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { loadEnv } from "../env.js";
import { getAppName } from "../lib/brand.js";
import {
  classifyDatabaseError,
  isPostgresAuthenticationError,
  noteDatabaseFailure,
} from "../lib/db-errors.js";
import { safeErrorLabel, safeLogText } from "../lib/startup-log.js";
import { authTrustedOrigins } from "./origins.js";
import { sendWithActiveMailProvider } from "../services/mail-provider.js";

const env = loadEnv();
const db = createLiveDb(env);

const isProduction = env.NODE_ENV === "production" || env.BETTER_AUTH_URL.startsWith("https://");

const appName = getAppName(process.env);

export const auth = betterAuth({
  appName,
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: authTrustedOrigins(env.FRONTEND_URL),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  user: {
    additionalFields: {
      mustChangePassword: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      twoFactorEnforcementAfter: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  plugins: [
    admin({
      ac: sendstackAccessControl,
      roles: sendstackAdminRoles,
      defaultRole: "user",
      adminRoles: ["super-admin"],
    }),
    twoFactor({
      issuer: appName,
      backupCodeOptions: {
        storeBackupCodes: "encrypted",
      },
    }),
    haveIBeenPwned({
      enabled: env.NODE_ENV !== "test",
    }),
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendWithActiveMailProvider(db, env, {
        to: user.email,
        subject: `Reset your ${appName} password`,
        text: `You requested a password reset for your ${appName} account.\n\nReset your password: ${url}\n\nIf you did not request this, you can ignore this email.`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendWithActiveMailProvider(db, env, {
        to: user.email,
        subject: `Verify your ${appName} email`,
        text: `Welcome to ${appName}.\n\nVerify your email address: ${url}`,
      });
    },
  },
  advanced: {
    defaultCookieAttributes: {
      secure: isProduction,
      sameSite: "lax",
      httpOnly: true,
    },
  },
  logger: {
    log(level, message, ...args: unknown[]) {
      for (const arg of args) {
        const failure = classifyDatabaseError(arg);
        if (failure) {
          noteDatabaseFailure(failure);
          console.error(
            `[database] unavailable kind=${failure.kind} code=${failure.code ?? "none"} ${safeErrorLabel(arg)}`,
          );
          return;
        }
        if (isPostgresAuthenticationError(arg)) {
          console.error("[database] authentication rejected by server");
          return;
        }
      }
      if (level !== "error" && level !== "warn") return;
      const detail = args
        .map((arg) => (arg instanceof Error ? safeErrorLabel(arg) : ""))
        .filter(Boolean)
        .join(" ");
      const line = safeLogText(detail ? `${message} ${detail}` : message);
      console.error(`[auth] ${line}`);
    },
  },
});

export type Auth = typeof auth;
