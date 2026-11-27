---
name: review-cycle
description: Review a Web Console PR, fix what the review admits with parallel fixer agents that see the history of earlier findings and fixes, and review again until it converges; then confirm with a fresh review that sees no history. Use when the user runs /skill:review-cycle or asks to review and fix a PR in a loop.
allowed-tools: bash read write subagent
metadata:
  argument-hint: "[PR number or URL | --range=<base>..<head>] [--settled=<file>] [--max-fixers=N]"
---

# Review cycle

**Version 1.0.** Each change to this file raises it.

You are the orchestrator. You never review or fix code yourself: reviews run
in `review-pr-runner` agents, fixes in fixer agents. You keep the history,
group the findings, brief the fixers, pick their commits and decide when the
cycle ends.

**Two kinds of memory, kept apart.** Reviews find bugs best without history:
an earlier result anchors them and hides new bugs. Fixers fix best with
history: the same kind of bug coming back is a cause to fix once, not a
patch to repeat. So reviews never see earlier findings except through
review-pr's falsifiers (`--prior`), and the final review sees none at all;
fixers always see the history of the findings and fixes near theirs.

## Arguments

- The target: a PR number or URL, or `--range=<base>..<head>`.
- `--settled=<file>`: the user's decisions (declined findings, design
  choices). Every review gets it; answers the user gives during the cycle
  are added to it.
- `--max-fixers=N`: fixers running at once; default 4.

## Setup

1. Work on the branch the target names, in the user's repository. If the
   index holds staged files or tracked files have uncommitted changes, list
   them and ask whether to continue: the cycle commits only its fixers'
   changes and never stages anything else.
2. `STATE=$(mktemp -d /tmp/review-cycle.XXXXXX)`. Copy `--settled` to
   `$STATE/settled.md`, or create it empty. Create `$STATE/ledger.md`
   (below). Record `START=$(git rev-parse HEAD)`.
3. Pin the review base once. For a PR, fetch its base ref and take the merge
   base of its base commit and `START`. For an explicit range, resolve the
   supplied base to a SHA, take its merge base with `START`, and verify the
   supplied head resolves to `START`. Save the resulting SHA as
   `$STATE/base.sha`; never recalculate it during the cycle. Keep the PR
   number or URL for metadata only.
4. Every agent runs at xhigh at most, never max: launch the builtin `worker`
   with the `:xhigh` model suffix (`$PI_PROVIDER/$PI_MODEL:xhigh`).
5. Launch every agent with `async: false` (the tool defaults to async), so
   you wait in the call; never poll. The tool stops a child after 30
   minutes unless told otherwise: give each review `timeoutMs: 14400000`
   and each fixer `timeoutMs: 7200000`.
6. Reviews launch their own agents two levels below you, and the cycle
   launches many agents. Check `~/.pi/agent/extensions/subagent/config.json`
   before round 1: it needs `maxSubagentDepth` of at least 3 and
   `maxSubagentSpawnsPerRun` of at least 256 (or `PI_SUBAGENT_MAX_DEPTH` /
   the launch budget set as high). If not, stop and tell the user: the
   reviews cannot launch their agents.

## The ledger

`$STATE/ledger.md` is the cycle's memory, one row per finding, never
deleted:

| ID | Round | Review | Severity | Files | Class | Status | Fix commits |
|---|---|---|---|---|---|---|---|

- **ID** is `R<round>-<review id>` (`R1-M2`), unique without regard to case
  (macOS file names ignore case).
- **Class** is a short kebab-case root cause (`trigger-name-omits-value`),
  set by the fixer; reuse an existing class when it fits.
- **Status:** open, fixed, rejected (a fixer showed the finding is false;
  see step 2), asked, listed (Deferred or Adjacent), or stuck.

## The cycle

Number rounds from 1. A round is one review plus the fixes of what it
found. There is no round limit; the stop rules below end a cycle that does
not converge.

Start at step 1. For either review (steps 1 and 5), resolve the local cycle
branch's current HEAD to a SHA just before launching the Review template.
Always pass `--range=<pinned base SHA>..<local HEAD SHA>`, even if a PR was
given. Never review the PR's remote head in place of the local HEAD.

If a review returns `NOT RUN` (or the runner fails to return a valid review),
report the reason and retry once at the same level and revision, without
rerunning cleanup or counting another round. If the retry also cannot run,
stop and report the cycle as incomplete. Record and report valid reviews
before branching. A `needs discussion` verdict pauses the cycle for the
user's decision, even if there are no fixable findings. Record the answer
in `settled.md` and rerun the same review before continuing.

### 1. Run a level-2 review

- Launch `review-pr-runner` with the Review template: level 2,
  `--settled=$STATE/settled.md`, and from round 2 on `--prior` = every
  earlier report of this cycle.
- Add every finding to the ledger. Fix: Blocking, Moderate and Minor
  findings. List: Deferred and Adjacent findings; they are not fixed.
- Report to the user (see "Report after every review").
- If there are findings to fix, go to step 2.
- Otherwise, skip to step 5.

### 2. Attribute and group

For each finding to fix, look at its file and lines with `git log -L
<start>,<end>:<file> START..HEAD`:

- **A finding in lines an earlier fix of this cycle changed** is that fix's
  regression. It joins a group with that fix's ledger rows, and the fixer is
  told to revise the earlier fix, not to patch on top.
- **A finding that comes back** (the same problem at the same place, or the
  same class at a new place, after a fix) means the fixes so far treated
  instances, not the cause. Its group becomes a **general-fix group**: the
  fixer gets every ledger row of that class with all their fix commits, and
  is told to find the shared cause and replace the earlier fixes with one
  general change where that is correct, reverting or cleaning up what the
  general change makes unneeded. The cycle handles this itself; it is not a
  question for the user.

- **A finding a fixer rejected earlier** (same problem, same place), raised
  again without evidence the rejection's reason does not cover, stays
  rejected: it is not fixed again. With new evidence, it reopens.

Then group: findings that share a file, a component or a ledger class go to
one fixer, so that one fixer sees the whole of a related problem and two
fixers never edit the same file. Minor findings form groups of at most five
(6 Minor findings make two groups, 11 make three), related ones together.
Each group gets an ID (`R<round>-G<n>`). Take the groups to step 3.

### 3. Fix in parallel

For each group, create a worktree from the current HEAD:

```bash
git worktree add -b "cycle/$GROUP" "$STATE/wt/$GROUP" HEAD
ln -s "$PWD/node_modules" "$STATE/wt/$GROUP/node_modules"   # same lockfile
```

Launch up to `--max-fixers` fixers at once with the Fixer template, as a
rolling pool: start the next group as soon as one fixer returns. Every
fixer gets:

- its findings, verbatim from the review's finding files;
- **the history:** the ledger rows of earlier rounds that share a file or a
  class with its findings, with their fix commits (`git show --stat <sha>`
  is enough to point at them), and the question: "These problems came up
  before and were fixed with these commits. Is this the same kind of
  problem? Can one general change close the class instead of fixing this
  instance?";
- `$STATE/settled.md`, and the `web-console-tests` skill
  (`.agents/skills/web-console-tests/SKILL.md`).

Fixer replies:
- `FIXED`: record its class and proposed commits. A finding the fixer
  shows false (`FINDINGS: <ID>: false: <why>`) becomes `rejected` with its
  reason. Mark the other findings `fixed` only after the pick in step 4.
- `ASK`: ask the user, add the answer to `$STATE/settled.md`, and launch the
  group again with it.
- `BLOCKED`: the fixer could not make a change it can argue correct. Launch
  the group once more as a general-fix group with the fixer's reason; if it
  is blocked again, mark its findings `stuck`, report them, and go on with
  the rest.

Take the finished fixes to step 4.

### 4. Pick the commits

First check each fixer's scope: `git diff --stat <base>..cycle/$GROUP`. A
fix may touch the files its findings name, their tests, and the files its
stated general change needs (its GENERAL line). A file outside that is sent
back to the fixer with the file named, before anything is picked.

In the order the groups finished, cherry-pick each fixer's commits onto the
cycle branch (`git cherry-pick <base>..cycle/$GROUP`). On a conflict, abort
the pick and launch that group again on the new HEAD with the conflicting
commits named; a group that conflicts twice is merged with the group it
conflicts with and fixed by one fixer. Mark successfully picked findings
`fixed` and record the cycle branch's commit SHAs in the ledger. Remove each
worktree and branch once picked. Then go to step 1 for the next round.

### 5. Clean up, then the fresh review

When a level-2 review has nothing to fix, first launch one fixer with the
Cleanup template: it removes the cycle's residue from the code the cycle
changed - comments that narrate the cycle ("round 2", "per the review",
"previously fixed", "fix for finding M1"), leftover debug code - and commits
it. The fresh review then sees the cleanup too.

Then launch `review-pr-runner` at level 3
with the same pinned range rule and `--settled=$STATE/settled.md`, but
**no `--prior`**: a review that sees no history of this cycle.

- Record every finding in the ledger and report to the user.
- If there are actionable findings, go to step 2. Step 4 will take you back
  to level 2. Do not count already-stuck findings as new actionable work
  unless new evidence offers a path to fix them.
- End as converged only on `approve` or `approve with comments`, with no
  actionable findings and no unresolved `open`, `asked` or `stuck` items in
  the ledger. Otherwise, if nothing can proceed, report the outstanding
  items and end as incomplete. `NOT RUN` and `needs discussion` follow
  the transitions above, never the no-findings branch.

## Report after every review

After every review, level 2 or 3, tell the user exactly where the cycle is,
before anything else starts. As the main session, write it in the chat; as
a `review-cycle-runner`, send it to the parent with `contact_supervisor` as
a progress update, not a question, and go on. Say:

- **Finished:** the round and review level, its verdict, and its minutes;
  which earlier findings this review confirms fixed, and which came back.
- **Found:** each new finding to fix (ID, severity, one line), and each one
  listed instead (Deferred, Adjacent).
- **Starts now:** the groups about to be fixed (ID, findings, general-fix or
  not), or the fresh level-3 review, or the end of the cycle.
- **Stuck:** any finding marked stuck, with its reason.

## Stop and ask the user

Only for decisions the user owns:

- A fixer's `ASK`: a product, UX or strategy choice, such as changing what a
  feature does or which way a trade-off goes.
- A review's `needs discussion` verdict: ask about the unresolved decision.
- A review that cannot run twice in a row: stop and report the environment
  problem and the incomplete result. See the review transitions above.

Recurring findings, regressions of earlier fixes and blocked fixers are not
questions: the cycle handles them (step 2, general-fix groups).

Give the ledger rows concerned and the options. Wait for the answer;
everything else in the round may go on.

## Rules

- Never push, amend, rebase, reset, stash or force anything on the cycle
  branch. Commits come only from fixers, picked as step 4 says.
- Keep your own context small: read the agents' reply lines, not their
  files, unless a reply is unclear.
- Every heavy command runs through `scripts/with-slots.mjs`
  (web-console-tests, "Running tests"); fixers may run typecheck, build and lint as they see
  fit.

## Final summary

- One line per round: review level, verdict, findings fixed, minutes spent
  reviewing and fixing.
- **The trend:** findings to fix per review (Blocking / Moderate / Minor),
  and whether the cycle converged steadily, stalled or went up and down,
  with the cause where a round went up.
- The ledger's classes, with the findings and commits each covers.
- Listed findings (Deferred, Adjacent) and stuck ones.
- Whether the cycle converged, paused for discussion, or stopped incomplete;
  the last review's verdict and report path, if available.
- `git log --oneline <START>..HEAD`. Nothing was pushed.

## Templates

### Review

```text
Run one review in <repo>. Read .agents/skills/review-pr/SKILL.md and follow
it with these arguments:
[<PR number or URL, for metadata only>]
  --range=<pinned base SHA>..<current local cycle HEAD SHA>
  --level=<2|3> --settled=<STATE>/settled.md
  [--prior=<comma-separated earlier reports, level 2 only>]
You are the review's parent: launch its agents yourself, each with
async: false. Write your files to <STATE>/review<N>/:
- report.md: the Step 4 report;
- <ID>.md: each Blocking, Moderate and Minor finding, verbatim, with its file
  and lines.
Reply with only these lines (or only `NOT RUN: <why>` when the review could
not run):
VERDICT: approve | approve with comments | request changes | needs discussion
DISCUSSION: <decision needed and options> (only for needs discussion)
BLOCKING: <ID> <one line>, one line each | none
MODERATE: <ID> <one line>, one line each | none
MINOR: <ID> <one line>, one line each | none
DEFERRED: <ID> <one line>, one line each | none
ADJACENT: <ID> <one line>, one line each | none
```

### Fixer

```text
Fix a group of review findings in <worktree> (branch cycle/<GROUP>, from
the cycle's HEAD). Follow the web-console-tests skill
(.agents/skills/web-console-tests/SKILL.md).

Findings: <finding files>.
History: <ledger rows of earlier rounds that share a file or class, with
their fix commits> | none.
[Regression: <finding> is in lines your group's earlier fix <sha> changed.
Revise that fix; do not patch on top of it.]
[General fix: these findings came back after the fixes in the history. Find
the cause they share and replace the earlier fixes with one general change
where that is correct; revert or clean up what it makes unneeded.]
Decisions to follow: <STATE>/settled.md.

These problems may have come up before. Is this the same kind of problem as
the history? Can one general change close the class instead of fixing this
instance? Prefer the general change when it is correct for every instance;
a class fix comes with a table-driven test over the registry or catalog
(web-console-tests, "Class fixes").

A finding is fixed only by fixing its cause. Deleting or loosening an
assertion, widening a type to `any`, catching and ignoring an error, skipping
a test, or weakening a documented behavior to make the finding go away is
not a fix; it is a new finding. Touch only the findings' files, their tests,
and what your general change needs; name every other file on GENERAL.

For each finding: write a test that fails for the reason the finding gives,
fix the root cause, run the test and the existing tests of the code you
changed (web-console-tests, "Running tests"). A finding that turns out
false: say why and change nothing. A product or design choice the user owns: stop and ask it,
with each option's cost and your pick.

Commit in your worktree: Conventional Commits without a scope, the
description not repeating the type, title ≤ 72 characters; stage only your
files; never push, amend, rebase, reset or stash.
Reply with only these lines:
RESULT: FIXED <first sha>..<last sha> | ASK: <question> | BLOCKED: <why>
CLASS: <kebab-case root cause>; GENERAL: <the general change made, or why one does not fit>
FINDINGS: <ID: fixed | false: why>, one per finding
TESTS: <tests added, and the tests run>
```

### Cleanup

```text
Clean up after a review cycle in <worktree> (branch cycle/cleanup, from the
cycle's HEAD). The cycle changed these files: <files from git diff
--name-only START..HEAD>. In those files only, remove what narrates the
cycle rather than describing the code: comments such as "round 2", "per the
review", "previously fixed", "fix for finding M1"; leftover debug output and
commented-out code the cycle added. Leave any comment that explains the code
as it is now. Change no behavior. Run the tests of the files you changed
(web-console-tests, "Running tests"), then commit: `chore: remove review
cycle residue`, staging only your files.
Reply with only:
RESULT: FIXED <sha> | NONE: nothing to remove
FILES: <changed files>
```
