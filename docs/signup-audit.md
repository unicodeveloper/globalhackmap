# Signup conversion audit

Reviewed 3 November 2026 from the application code and browser behavior. No production funnel analytics or provider account-creation data was available. Recommendations are hypotheses, not demonstrated conversion lifts.

## Recommendation

Keep **three distinct free dossiers per day** as the baseline. Do not require signup before the first useful CVE detail. Once the flow is reliable and measurable, test **one free dossier versus three**, with the prompt appearing on the next new dossier. Gating the first click and allowing one useful dossier are different experiments.

Optimise for completed signups that lead to a useful action, not modal impressions or signup starts alone. Public security information, shareable pages and a working map help visitors decide whether an account is worth creating.

## Current flow

- In account mode, `FREE_OPENS = 3` grants distinct incident/CVE dossier opens per UTC day using localStorage. Reopening the same dossier is free. The synchronous store update prevents a double-click on the same dossier from using two opens.
- While auth is still loading, dossier opening is allowed and not counted. A slow or failed auth request can therefore make prompt timing feel inconsistent.
- The check experience already shows the most urgent result in full, then asks for sign-in to reveal other detailed results. Basic browsing and product selection remain useful.
- New questions and research request an account. The client gates these actions, while the server separately has anonymous brief allowances. The UI policy and the backend free-answer policy are not identical.
- Direct public CVE/incident pages, runbooks, feeds and the read-only MCP are not a hard account paywall. This is a conversion prompt, not a security boundary or effective bot defence.
- Signup and login share a Valyu OAuth entry point. The callback returns to the saved pathname/query. The interface does not receive a reliable new-account flag, so successful login must not be counted as a new signup without provider evidence.

## Findings and priorities

| Priority  | Finding                                                                                                                                          | Impact / action                                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0, fixed | Returning to the homepage restored an Atlas canvas whose context had been deliberately lost. It covered the working globe with white.            | A broken-looking product undermines trust before any signup prompt. Canvas ownership now matches the effect lifecycle; repeated home/Back/Forward navigation is covered by a browser regression.                                           |
| P0, fixed | The sign-in modal stayed in a pending state after an external return, popup fallback or failure, and pending state blocked dismissal.            | Pending now resets after completion/failure and on pageshow; failure has a generic retry message; close/Escape remain usable.                                                                                                              |
| P0, fixed | A short-screen signup dialog could extend beyond the viewport.                                                                                   | The dialog now has a dynamic viewport height ceiling and scrolls. Small portrait and landscape bounds were verified.                                                                                                                       |
| P1        | The blocked dossier is not retained as a signup intent. `selectCve` / `select` return before updating selection when the allowance is exhausted. | OAuth can return to the previously open dossier rather than the one the visitor tried to open. Preserve the pending target and restore it after authentication. Do this before reducing the free allowance.                                |
| P1        | A gated question or research action is not automatically restored/resumed after authentication.                                                  | Preserve a non-sensitive intent and return to a ready-to-run action. Do not automatically start paid research after login.                                                                                                                 |
| P1        | `/api/track` only accepts fix/check/share/cinema events; signup impressions, starts, callback success and activation are not measured.           | Implement the funnel below before claiming a winning threshold. Current logs cannot establish signup conversion.                                                                                                                           |
| P1        | The navigation says “Sign in”; the prompt lists several broad benefits and sends the visitor to another product's account system.                | Test a clearer new-user CTA, such as “Create a free account with Valyu”, with a quiet existing-user path. State that the visitor returns to the same task. Confirm any “no credit card” or timing claim with the provider before using it. |
| P1        | Account mode can be enabled without valid OAuth settings; `startSignIn` then opens the generic platform auth page in a new tab.                  | Validate hosted account-mode configuration at deployment. A platform account created through the fallback is not proof the app has an authenticated session.                                                                               |
| P2        | The allowance hint appears in a desktop-only sidebar footer.                                                                                     | Make the remaining free allowance discoverable on mobile, without interrupting the first useful action. A surprise gate feels less fair than a visible quota.                                                                              |
| P2        | Other entry points call `startSignIn` directly; the pricing CTA has a separate delayed pending reset.                                            | Consolidate sign-in error/pending/return handling so all entry points have the same recovery behavior.                                                                                                                                     |
| P2        | The allowance counts opens, not useful reading; quick accidental navigation can spend an open.                                                   | If analytics confirm this problem, count a meaningful detail view rather than raw clicks. Avoid a delay that flashes a full dossier before blocking it.                                                                                    |

## Measurement plan

Use a stable, randomly assigned experiment variant, not a per-render random choice. Separate new visitors, returning signed-out visitors and already-authenticated users. Segment mobile/desktop and entry surface.

Suggested events with constrained values, no raw question, manifest, email, IP or OAuth token:

1. `dossier_viewed`: surface, ordinal distinct free dossier, incident/CVE type.
2. `signup_prompt_viewed`: reason, entry surface, experiment variant, allowance remaining.
3. `signup_prompt_dismissed`: reason and method (close, Escape, backdrop).
4. `auth_started`: entry surface, reason and variant.
5. `auth_completed`: verified callback success, including returning logins.
6. `account_created`: only when the identity provider confirms a newly created account.
7. `auth_failed`: a controlled error category, never upstream response text.
8. `post_auth_action`: reopened target, completed check, or fix/runbook action. Paid research remains an explicit action.

Primary experiment measure: **verified new accounts per eligible visitor**, with **activated accounts per eligible visitor** as the decision-quality check. Also monitor auth-start-to-completion, time to first useful result, immediate exits, prompt dismissal, share/fix activity and seven-day return. If account creation cannot be distinguished from login, report authenticated conversions honestly as a separate measure.

Run one-versus-three only after fixing lost intent and instrumenting the funnel. Predeclare the primary measure, eligibility, minimum detectable effect and analysis window from actual traffic. Stop neither because a variant gets more modal clicks nor because a small early sample looks favourable. Keep three if the result is inconclusive.

## Verification limits

Store tests cover free allowance, reopen behavior, authenticated/loading bypass and self-hosted mode. Browser checks covered the modal's failure/fallback recovery, pageshow handling, dismissal and small-screen scroll bounds using a temporary local test fixture, which was removed afterward. A live new-account creation and OAuth callback against the hosted identity provider was not exercised because local OAuth credentials were not configured.
