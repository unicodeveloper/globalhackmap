/** Public base URL, used for metadata, share links and agent runbooks. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const REPO_URL = "https://github.com/yorkeccak/globalhackmap";
export const VALYU_URL = "https://www.valyu.ai";
export const VALYU_SIGNUP_URL = "https://platform.valyu.ai/auth";
export const VALYU_KEYS_URL = "https://platform.valyu.ai/user/account/apikeys";
export const VALYU_PLANS_URL = "https://platform.valyu.ai/user/account/billing?tab=plan";
