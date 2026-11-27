---
name: review-cycle
description: Review a Web Console PR, fix what the review admits with parallel fixer agents that see the history of earlier findings and fixes, and review again until it converges; then confirm with a fresh review that sees no history. Use when the user runs /review-cycle or asks to review and fix a PR in a loop.
argument-hint: "[PR number or URL | --range=<base>..<head>] [--settled=<file>] [--max-fixers=N]"
---

# Review cycle

**Version 1.0.** Each change to this file raises it.

Run `/review-cycle <args>` in Claude Code and use `$ARGUMENTS`.
Run this skill in the main conversation; it owns all user questions.

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
   them and pause for a clean cycle checkout. Never stage, stash or modify
   the user's changes to make the cycle run.
2. `REPO=$(git rev-parse --show-toplevel)` and
   `STATE=$(mktemp -d /tmp/review-cycle.XXXXXX)`. Use absolute paths from
   the orchestrator checkout for skill files (not copies in fixer worktrees).
   Copy `--settled` to `$STATE/settled.md`, or create it empty.
   Create `$STATE/ledger.md`
   (below). Record `START=$(git rev-parse HEAD)`.
   Create `BUILD_CACHE=$(mktemp -d /tmp/review-cycle-builds.XXXXXX)`
   separately from `$STATE` and record it in `$STATE/build-cache.path`.
   Keep the same path across rounds, retries and discussion, never another
   cycle. It contains only completed build artifacts (plus any
   incomplete staging directories), not worktrees, live databases, logs,
   coverage, ledger or reports. At a truly terminal stop it can be removed
   after all producers and consumers have stopped.
3. Pin the review base once. For a PR, fetch its base ref and take the merge
   base of its base commit and `START`. For an explicit range, resolve the
   supplied base to a SHA, take its merge base with `START`, and verify the
   supplied head resolves to `START`. Save the resulting SHA as
   `$STATE/base.sha`; never recalculate it during the cycle. Keep the PR
   number or URL for metadata only.
4. Use the native `Agent` tool and explicit `subagent_type`s. Launch each
   review, including a retry and the final L3, as a new named non-fork
   `review-pr-runner`; never fork or resume. Launch fixers and cleanup as
   new `general-purpose` agents with the worktree and exact task. Use
   at most `xhigh` effort.
5. Check that local named agents and nested `Agent` are available, and that
   effective depth is at least 2 (default 3 on Claude Code 2.1.325). Check
   `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` and
   `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` if set; allow space for the runner
   plus its review leaves. Never edit permissions/settings to make it work.
6. Wait for the actual completion of each review before deciding what to
   do next. For fixes, use a bounded rolling pool and consume finished
   notifications; if this mode cannot deliver them, wait for foreground
   results sequentially. A launch acknowledgment is not a result.
   Reserve up to four hours for a review and two for a fixer as workflow
   budgets, not tool arguments. Never count unfinished work as successful
   or remove a worktree while its agent or commands can still write to it.

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
branch's current HEAD just before launching the Review template. On retry
or resume, pause if HEAD differs from the SHA pinned for that review.
Always pass `--range=<pinned base SHA>..<local HEAD SHA>`, even if a PR was
given. Never review the PR's remote head in place of the local HEAD.

Pass `--build-cache=<absolute BUILD_CACHE>` to every review attempt. Run
one review at a time: its `review-pr-runner` is the sole build publisher.
Before retrying or launching the next review, confirm the previous runner
and its build commands are terminal. Fixers and review leaves never publish
review artifacts or receive the writable cache as a task input; private
fixer validation builds still follow the existing slot rules.

Assign a new, empty output directory to each attempt, including retries.
Before acting on any verdict, verify that its `report.md` records the pinned
base and HEAD, the requested level and the same verdict as the reply. Check
that every actionable ID in the report and reply agrees and that each has a
nonempty `<ID>.md` in the assigned directory. Missing or mismatched results
are `NOT RUN`, not a no-findings review.

If a review returns `NOT RUN`, report the reason and retry once at the same
level and revision, without
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
Each group gets an ID (`R<round>-G<n>`) and a disjoint list of allowed paths.
Pass that list to the fixer, including tests and identified shared code.
Regroup overlapping work before edits.

### 3. Fix in parallel

For each group, create a dedicated worktree from the current HEAD and
record its exact base SHA. Use the worktree path explicitly in each shell
or file call. Never write to the cycle checkout or another group's path:

```bash
FIX_BASE=$(git -C "$REPO" rev-parse HEAD)
BRANCH="cycle/$(basename "$STATE")/$GROUP"
git -C "$REPO" worktree add -b "$BRANCH" "$STATE/wt/$GROUP" "$FIX_BASE"
CACHE_DIR=$(mktemp -d "$STATE/vite.XXXXXX")
# Link paths only under the conditions below.
ln -s "$REPO/node_modules" "$STATE/wt/$GROUP/node_modules"
```

Pass the absolute `CACHE_DIR` to each fixer. Link dependencies only if they
are installed, the manifests and lockfile match, and the target's
`vite.config.mts` uses `QDB_VITE_CACHE_DIR` for its `cacheDir`. Otherwise
install dependencies in that worktree under `with-slots` (weight 2). Use a
new cache directory for cleanup and each new fixer worktree too.

Launch up to `--max-fixers` fixers at once with the Fixer template, as a
rolling pool: refill when a finished result is consumed and the slot is
free. Respect the native capacity shown in Setup. Every fixer gets:

- its findings, verbatim from the review's finding files;
- **the history:** the ledger rows of earlier rounds that share a file or a
  class with its findings, with their fix commits (`git show --stat <sha>`
  is enough to point at them), and the question: "These problems came up
  before and were fixed with these commits. Is this the same kind of
  problem? Can one general change close the class instead of fixing this
  instance?";
- `$STATE/settled.md`, and the `web-console-tests` skill
  (`.claude/skills/web-console-tests/SKILL.md`).

Fixer replies:
- `REJECTED`: every assigned finding is false. Verify one reason per ID,
  no commits after its base, and a clean worktree. Record the rejections
  and skip the pick; invalid results are `BLOCKED`.
- `FIXED`: record its class and proposed commits. A finding the fixer
  shows false (`FINDINGS: <ID>: false: <why>`) becomes `rejected` with its
  reason. Mark the other findings `fixed` only after the pick in step 4.
- `ASK`: ask the user, add the answer to `$STATE/settled.md`, and launch the
  group again with it.
- `BLOCKED: scope <paths>`: update the allowed paths and regroup the
  affected work before retrying. Never authorize simultaneous edits.
- Other `BLOCKED`: the fixer could not make a change it can argue correct. Launch
  the group once more as a general-fix group with the fixer's reason; if it
  is blocked again, mark its findings `stuck` and report them. Finish the
  remaining disjoint work in this round, then pause at Step 4.

Take the finished fixes to step 4.

### 4. Pick the commits

Before picking, verify the reported SHAs are the group's commits after
`<fix-base>`. Compare the paths in **each** commit (`git diff-tree
--no-commit-id --name-only --no-renames -r <sha>`) against the assigned list.
GENERAL does not expand scope. Reject any out-of-scope pick and regroup.

In the order the groups finished, cherry-pick each fixer's commits onto the
cycle branch (`git cherry-pick <fix-base>..<fix-branch>`) only while its
index and tracked files are clean. On a conflict, abort the pick and launch that group again on the new HEAD with the conflicting
commits named; a group that conflicts twice is merged with the group it
conflicts with and fixed by one fixer. Mark successfully picked findings
`fixed` and record the cycle branch's commit SHAs in the ledger. Remove each
worktree and branch once picked. If any findings became stuck, report them
and the ledger checkpoint and pause before another round; never call that
converged. Otherwise go to step 1 for the next round.

### 5. Clean up, then the fresh review

When a level-2 review has nothing to fix, first launch one fixer with the
Cleanup template: it removes the cycle's residue from the code the cycle
changed - comments that narrate the cycle ("round 2", "per the review",
"previously fixed", "fix for finding M1"), leftover debug code - and commits
it in its own worktree. Apply Step 4's scope check and pick its local
commit (if any) before pinning the final HEAD. If cleanup cannot complete,
pause and report the checkpoint rather than review an unverified state.

Then launch `review-pr-runner` at level 3
with the same pinned range rule and `--settled=$STATE/settled.md`, plus
`--fresh` and **no `--prior`**. Give this fresh runner only those inputs,
the separate `--build-cache` path and an output directory separate from
cycle history. Do not pass the cache checkpoint file or any history files.
Do not pass the round number, findings, fixes or review narratives. The
explicit settled decisions are the only exception; PR metadata is still
allowed, but no PR comments or review threads. Store each report path in
root state so a later level-2 review can use it as `--prior`; never pass
that index to the L3 runner.

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
before anything else starts. Write it in the main conversation; use the
runner's report artifact and reply, not the child transcript. Say:

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

Give the ledger rows concerned and options in the main conversation.
For `ASK` or `needs discussion`, record the checkpoint and wait for an
explicit answer before retrying affected work. Use a normal chat question
if no interactive question tool is available. Child roles return the
question and options; they never answer for the user. When stuck, present
the checkpoint, exact HEAD and blockers without declaring success.

## Rules

- GitHub is read-only; never post, comment, file, edit, label or merge there.
- Never push, amend, rebase, reset, stash or force anything on the cycle
  branch. Commits come only from fixers, picked as step 4 says.
- Keep your context small: verify the review report's identity, verdict,
  and finding IDs as above. Otherwise read agent reply lines and only the
  files needed to check a result or brief a fixer.
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
Run one review in <absolute repo path>. Read its
.claude/skills/review-pr/SKILL.md and follow it with these arguments:
[<PR number or URL, for metadata only>]
  --range=<pinned base SHA>..<current local cycle HEAD SHA>
  --level=<2|3> --settled=<STATE>/settled.md
  --build-cache=<absolute BUILD_CACHE>
  [--prior=<comma-separated earlier reports, level 2 only>]
  [--fresh, level 3 only]
You are the review's parent: launch and await its native agents as the
skill specifies. Write to <assigned absolute output directory> (for
`--fresh`, a separate directory with no cycle history):
- report.md: the Step 4 report with full `BASE: <sha>` and `HEAD: <sha>`
  from the actual review's Git setup, `LEVEL: <2|3>` and `VERDICT: <verdict>`.
  Report the revisions actually reviewed, not just the requested arguments;
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
Fix a group only in <absolute worktree> (branch <fix-branch>, from exact
SHA <fix-base>). Allowed paths: <disjoint path list>. Follow the skill at
<orchestrator repo>/.claude/skills/web-console-tests/SKILL.md. Never write to GitHub.

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
not a fix; it is a new finding. Edit only the assigned paths, including for
GENERAL. If a correct fix needs any unassigned path, return
`BLOCKED: scope <paths>` before editing it; the parent can regroup.

Cache directory: <absolute CACHE_DIR>. Set QDB_VITE_CACHE_DIR to this path
for every Vite and Vitest command (also via yarn scripts), in the same shell
call as the command. Do not install or update dependencies through a
node_modules symlink. If dependency files need to change, or the Vite
config stops honoring QDB_VITE_CACHE_DIR, remove only the symlink and
install private dependencies before running commands that write there.

For each finding: write a test that fails for the reason the finding gives,
fix the root cause, run the test and the existing tests of the code you
changed (web-console-tests, "Running tests"). For security weaknesses,
inspect the invariant in source and test only safe ordinary behavior with
benign fixtures. Never reproduce a vulnerability, even to get a red test.
A finding that turns out false: say why and change nothing. If all findings
are false, return `REJECTED` with a reason per ID and no commits. A product or
design choice the user owns: stop and ask it,
with each option's cost and your pick; return `ASK` to the root.

Commit in your worktree: Conventional Commits without a scope, the
description not repeating the type, title ≤ 72 characters; stage only your
files; never push, amend, rebase, reset or stash.
Reply with only these lines:
RESULT: FIXED <first sha>..<last sha> | REJECTED | ASK: <question> | BLOCKED: <why>
CLASS: <kebab-case root cause>; GENERAL: <the general change made, or why one does not fit>
FINDINGS: <ID: fixed | false: why>, one per finding
TESTS: <tests added, and the tests run>
```

### Cleanup

```text
Clean up only in <absolute worktree> (branch <cleanup-branch>, from the
cycle's exact HEAD SHA). The cycle changed these files: <files from git diff
--name-only START..HEAD>. In those files only, remove what narrates the
cycle rather than describing the code: comments such as "round 2", "per the
review", "previously fixed", "fix for finding M1"; leftover debug output and
commented-out code the cycle added. Leave any comment that explains the code
as it is now. Change no behavior. Use QDB_VITE_CACHE_DIR=<absolute cleanup
CACHE_DIR> on each Vite/Vitest command; use the same dependency rules as
for a fixer worktree. Run the tests of the files you changed
(web-console-tests, "Running tests"), then commit: `chore: remove review
cycle residue`, staging only your files. If you cannot complete, reply
`RESULT: BLOCKED: <reason>`; do not claim cleanup was successful.
Reply with only:
RESULT: FIXED <sha> | NONE: nothing to remove
FILES: <changed files>
```
