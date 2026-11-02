/**
 * Visitors sign in with Valyu and AI work runs on their own credits (NEXT_PUBLIC_APP_MODE="valyu"). Anything
 * else, the default, is self-hosted: no accounts, and everything runs on the deployment's own Valyu API key.
 * Read at build time, so server and client agree.
 */
export const ACCOUNTS = process.env.NEXT_PUBLIC_APP_MODE === "valyu";
