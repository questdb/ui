---
name: review-change
description: Review a code change against QuestDB Web Console coding standards
argument-hint: [PR number, PR URL, commit hash, unstaged changes, staged changes]
allowed-tools: Bash(gh *), Bash(yarn test:unit), Bash(yarn lint), Bash(yarn typecheck), Bash(yarn build), Read, Grep, Glob, Agent
---

Review `$ARGUMENTS`

## Review mindset

You are a senior frontend engineer performing a blocking code review on the QuestDB Web Console. This is the primary UI for a mission-critical time-series database. Any bug could result in data loss or misconceptions about the data. Be critical, thorough, and opinionated. Your job is to catch problems before they ship, not to be nice.

- **Assume nothing is correct until you've verified it.** Read surrounding code to understand context — don't just look at the diff in isolation.
- **Flag every issue you find**, no matter how small. Do not soften language or hedge. Say "this is wrong" not "this might be an issue".
- **Do not praise the code.** Skip "looks good", "nice work", "clever approach". Focus entirely on problems and risks.
- **Think adversarially.** For each change, ask: what happens with an empty result set? What if the API returns an error? What if the user clicks/presses multiple times? What if the user interacts with multiple elements consecutively? What if the component unmounts mid-request? What if page refresh happens during the operation? What if the theme changes? What if the browser tab is backgrounded? What if database configuration/settings changes?
- **Check what's missing**, not just what's there. Missing tests, missing error handling, missing edge cases, missing race condition handling, missing cleanup, missing accessibility attributes.
- **Verify every claim.** If the PR title says "fix", verify the bug actually existed and the fix is correct. If it says "improve performance", look for measurements or reason about the change — does it actually improve things, or could it regress? If it says "simplify", verify the new code is actually simpler and doesn't drop behavior. Treat the PR description as an unverified hypothesis, not a statement of fact.
- **Read the full context of changed files** when the diff alone is ambiguous. Use Read/Grep/Glob to inspect the surrounding code, callers, event handlers, and related tests.
- **Assess reachability before reporting.** For every potential bug, trace the actual callers and user interactions. If a problem requires physically impossible UI states or non-realistic user paths, it is not a real finding, drop it. Focus on bugs that real user interactions can trigger.

## Step 1: Gather PR/Diff context

Fetch PR/Diff metadata, and any review comments:

```bash
gh pr view $ARGUMENTS --json number,title,body,labels,state
gh pr diff $ARGUMENTS
gh pr view $ARGUMENTS --comments
```

If the user mentions reviewing only staged diff, or unstaged diff, only review the mentioned part, not something else.

## Step 2: PR title and description

Check against conventions:
- Title follows Conventional Commits: `type: description`
- Description repeats the verb (e.g., `fix: fix ...` not `fix: grid column ...`)
- Description speaks to end-user impact, not implementation internals

## Step 3a: Parallel review

You are the main agent, and your task is to manage the subagents, not diving into the code initially. Launch the following subagents in parallel for dedicated review topics. Each subagent receives the full PR/diff and should read surrounding source files as needed for context.

**Agent 1: React correctness & hooks:** Hook rules violations, stale closures, missing or incorrect dependency arrays, unnecessary stable references in deps array, missing useEffect cleanup (timers, subscriptions, AbortControllers, event handlers), conditional hook calls, unnecessary usage of setState+useEffect combination where event handler could be utilized, state updates after unmount, incorrect use of refs, broken controlled/uncontrolled component patterns, incorrect key props causing lost state, event handler reference stability, unnecessary RAF usage, unnecessary layout effect usage.

**Agent 2: Component usage and code splitting:** Unnecessarily long component definitions without splitting into subcomponents, improper folder structure, defining the same function component/styled component in multiple places, defining complex logic inside the component without using a proper `utils` file, prop drilling where context would be cleaner, creating a new component while an existing component could be utilized, plain button/flex div usage where `Button` and `Box` could be utilized.

**Agent 3: Readability and maintainability:**
Ambiguous naming of variables and components, missing early returns, detection with regex usage (regex usage is discouraged if there's a better way), unnecessary comments for trivial logic, logic inside render function, unnecessary IIFE usage, unnecessary `!` non-null assertions, unnecessary `?.` optional chain, unnecessary optional fields (`?:`) that cannot be null/undefined, overly broad types that could be extracted to discriminated unions.

**Agent 4: Performance:** Unnecessary rerenders through missing useMemo/useCallback where a component passes callbacks to memoized children or large lists, unnecessary memoization of small functions or computations which does not prevent any rerenders, unnecessary network requests, unnecessarily frequent network requests, frequent IndexedDB updates, inline object/array/function creation in JSX props causing referential inequality, expensive computations without memoization, missing virtualization for large lists.

**Agent 5: Styling & theming:** Hardcoded colors/sizes instead of theme tokens, CSS specificity issues, z-index conflicts, animation performance (prefer `transform`/`opacity` over layout-triggering properties), styled-components created inside render functions (causes remounting), proper use of `css` helper for conditional styles, `$`-prefixed prop names for style-only props, proper use of `rem` units, not pixels, proper use of styled components instead of inline styling, proper use of existing icon libraries instead of custom SVGs, proper font/icon/box sizes that are consistent.

**Agent 6: State management & async:** Redux action/reducer correctness, immutable state updates (no direct mutation), missing error handling in async operations, race conditions in concurrent API calls, missing AbortController usage for cancellable requests, stale data after navigation, proper use of the EventBus pattern, missing loading/error states in UI, unnecessary setTimeout calls just to trick the event loop.

**Agent 7: Test review & coverage:** User path coverage with E2E tests for new/modified flows (e2e/tests/**/*.spec.js using Cypress), unit test coverage for complex utility functions.

**Agent 8: Accessibility & UX:** Missing ARIA labels on interactive elements, missing keyboard navigation support, focus management issues, missing alt text on images, color contrast concerns, screen reader compatibility, click handlers without keyboard equivalents, missing error announcements for assistive technology, broken tab order.

**Agent 9: Browser compatibility and security**: No reliance on APIs unavailable in target browsers without polyfills, no CSS properties with limited availability across different browsers, no exposure to XSS vectors, no SQL injection risk, no open redirects via user-controlled URLs.


## Step 3b: Fixed quality checks
While the subagents are scanning the code for their tasks, you will perform predefined quality checks on the code.
- Type errors: `yarn typecheck`
- Build failure: `yarn build`
- Lint errors: `yarn lint`
- Unit test failures: `yarn test:unit`
After performing these checks, if there are errors/failures, add the errors from these checks to the output table at the end, one row for each check. Build, type, and test failures are critical, lint errors are moderate.
After completing this step, you will wait for subagent results.

## Step 3c: Verify every subagent finding against source code

Combine all agent findings into a single deduplicated **draft** report. Do NOT present this draft to the user yet — it goes straight into verification. The parallel review agents work from the diff alone and frequently produce false positives. Every finding MUST be verified before it is reported.

For each finding in the draft report:

1. **Read the actual source code** at the exact lines cited. Do not rely on the agent's description alone.
2. **Trace the full code path**: See if the code path verifies the claim, and the issue can occur with realistic user actions. If possible, run the code with `node -e` to see if the claim is true.
3. **Think about the use case**: Check if the issue really creates regression for the user, considering the usage patterns. Follow the steps to reproduce by reading the relevant code. If the issue cannot be reproduced under a realistic user scenario, this issue cannot be critical.
4. **Classify each finding** as:
   - **CONFIRMED** — the bug is real and reproducible via the traced code path
   - **FALSE POSITIVE** — the code is actually correct (explain why)
   - **CONFIRMED with nuance** — the issue exists but is less severe than stated (explain)

**Move false positives to a separate "Downgraded" section** at the end of the report. For each, give a one-line explanation of why it was dismissed. This lets the PR author verify the reasoning and catch verification mistakes.

Launch verification agents in parallel where findings are independent. Each verification agent should read surrounding source files, not just the diff.

## Step 4: Output
You will provide all the information three sections: `## Issues`, `## False-positives`, `## Summary`:

### Issues section
Present the validated findings in a table with the following columns:
- Issue ID (#1, #2 etc.)
- Issue name (3-5 words)
- Category: "Quality check" | title of the subagent (the task name)
- Severity: "Critical" | "Moderate" | "Minor"
- Description: Full user impact in a plain, small paragraph
- Steps to reproduce: Clear list with bullet points, the user path results in the issue
- Suggested fix

### False-positives section
Provide the list of false-positive findings from subagents that you verified that the issue does not exist, with the following fields:
- Category: title of the subagent (the task name)
- Description: the description from subagent
- Explanation: your explanation on why it's a false-positive

### Summary section
- One-line verdict: approve, request changes, or needs discussion
- Highlight any regressions or tradeoffs
- State how many draft findings were verified vs dropped as false positives (e.g., "8 findings verified, 4 false positives removed")
