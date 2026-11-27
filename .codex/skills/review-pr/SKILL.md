---
name: review-pr
description: Review a QuestDB Web Console pull request, a commit, staged or unstaged changes, or a local Git range against the Web Console standards. Use when asked to review a PR, given a PR number or URL, a commit hash, `staged`, `unstaged`, or --range=<base>..<head>, optionally with a review level 0..3. Performs an adversarial, blocking, evidence-gated code review.
metadata:
  argument-hint: "[PR number or URL | commit hash | staged | unstaged] [--range=<base>..<head>] [--level=0..3] [--block-at=critical|high|medium|low] [--body=<file>] [--prior=<file>,...] [--settled=<file>] [--headed]"
---

# Review a QuestDB Web Console change

**Version 2.0.** Each change to this file raises it.

```
/review-pr [PR number or URL | commit hash | staged | unstaged]
           [--range=<base>..<head>] [--level=0..3]
           [--block-at=critical|high|medium|low] [--body=<file>]
           [--prior=<file>,...] [--settled=<file>] [--headed]
```

Select `$review-pr` in Codex and put arguments after the skill mention, or
name the skill and target in your request.
A delegated runner uses the exact arguments in its task. The target is one of:

- a PR number or URL;
- `--range=<base>..<head>`; `--range=<base>..` reviews the working tree,
  uncommitted changes included;
- a PR and `--range` together: the PR's local commits, maybe not pushed yet,
  as `review-cycle` does. The PR gives the title, body, labels and comments; the
  range gives the code;
- a commit hash;
- `staged` or `unstaged`: only that part of the working tree.

If no target is given, the main conversation asks for one; a delegated
runner returns `NOT RUN: missing review target`. Flags:

- `--level=N` or `-lN`, `N` in 0-3, default 2 ("Review level"). A bare digit
  is a PR number, never a level.
- `--block-at=<tier>`: the lowest risk tier that blocks (Step 3c); default
  `high`. Critical findings rated below it ship as Deferred.
- `--body=<file>`: Step 2 checks this file as the PR body, such as a draft for
  commits not pushed yet.
- `--prior=<file>,...`: reports or finding lists of earlier reviews; Step 2.5f
  re-tests their findings.
- `--settled=<file>`: decisions a person made; read with `--prior` after
  discovery, each one settled (Step 2.5f).
- `--headed`: allows the headed-browser rung (6) at level 3. Headed Chrome is
  heavy and opens windows, so it never runs without it. Cypress (rung 5)
  needs no flag.

The cycle's final review also passes the internal `--fresh` flag: reject it
with `--prior`, do not fetch PR comments or threads, and take only the
pinned range, PR metadata (title, body, labels), and explicit `--settled`
decisions. Do not read the cycle ledger, reports, fix history or search for
any other review history. Never pass settled decisions to discovery.

The cycle also passes an internal `--build-cache=<absolute path>`. It is an
artifact-only directory, separate from cycle state and safe to pass to the
fresh runner. Use only the supplied path, not neighboring directories or
files. Standalone reviews default to a private `$RV/build-cache`.

Strip the flags before passing the rest to `gh` or `git`.

> Use Codex's native shell/file tools and native subagents.
> Never edit the user's tree, commit or push. Install, build and test only
> in scratch worktrees. GitHub is read-only: never post, comment, file,
> edit, label or merge there. The main conversation owns user decisions.
> A delegated runner returns `NOT RUN` for missing input or `needs
> discussion` with a checkpoint and options, never an invented answer.

## Defensive evidence only

For a possible security weakness, inspect the source and document the
broken invariant at file and line. This rule overrides the discovery,
falsification, reproduction, risk and report templates: do not construct
payloads or attack sequences, run a security reproduction or exploit, or
ask an agent to do so. Route source-proved weaknesses through the static
admission rule; if source alone cannot prove a load-bearing premise, omit
it as unverified. Report only defensive source evidence and remediation,
not reproduction steps or attack instructions, including in Adjacent drafts.
Ordinary behavior probes with benign fixtures still use the evidence ladder.

## Review mindset

You are a senior frontend engineer doing a blocking review of the QuestDB Web
Console, the primary UI of a mission-critical database. A bug here loses work,
sends a write the user did not run, or shows data someone acts on.

- **A review that blocks on everything blocks on nothing.** Block only on a
  real user consequence; "approve" is a normal outcome of competent work.
- **Severity is not risk.** Rarity never makes you doubt a defect: admit it on
  evidence, then Step 3c decides whether it blocks.
- **Assume nothing is correct until verified;** read the surrounding code.
- **The diff is a hint, not the boundary.** The best bugs are at unchanged
  consumers of a contract the diff changed (Step 2.5).
- **Discovery is not a finding.** Every concern is a hypothesis until Step 3b
  admits it. Zero findings is a successful review.
- **Falsify before you explain** (Step 3b). Failing to disprove is not
  evidence, and uncertainty never becomes severity.
- **Keep the blast radius of the change small.** The change must fix what it
  set out to fix plus what it demonstrably breaks. Pre-existing bugs, residual
  hardening unchanged from base, and supporting propositions are never
  findings against it, unless it moves a pre-existing bug onto a live path.
  This limits what the change must fix, not what the review may know: a
  pre-existing bug proved to the same bar leaves as an Adjacent draft (Step
  4), as does a failure the hostile-input rule covers.
- **No praise.** Only problems and risks.
- **Think adversarially:** empty, error, timeout, partial or row-capped
  results; abort; double click or two elements acted on in quick succession;
  unmount mid-request; a disconnect; theme change; backgrounded tab; changed
  server settings; an agent editing the same notebook; a migration over data
  an old version wrote.
- **Demand optimal algorithms where they matter** (Agent 6, magnitude rule).
- **Demand a correct and easy user experience:** Agent 18's questions, first
  easy to use, short and direct path, promoted at the right place, no noise;
  then Truth, State, Feedback, Effort, Consistency, Safety, Stability.
- **Check what is missing:** tests, error and empty states, races, cleanup,
  accessibility.
- **Untested is a coverage risk, not a defect** (Step 2.6).
- **"Urgent", "simple" and "hard to test" are claims to prove,** not
  exemptions.
- **Verify every claim.** A "fix" fixed a real bug correctly; a "perf" change
  is measured or reasoned and regresses no other case; a "simplify" is
  simpler and drops no behavior. The PR body is a hypothesis.
- **Assess reachability before reporting:** trace the actual callers and user
  interactions; an impossible UI state or a path no user takes is no finding.

## Review level

Reserve level 3 for high-stakes changes: query execution, result rendering,
persistence and migrations, the notebook engine, agent tools and MCP,
auth/SSO, Monaco.

| Level | Step 2.5 | Discovery roles (cap) | Falsifiers | Gates |
|---|---|---|---|---|
| 0 | 2.5f only | parent, inline | parent, inline | typecheck, build |
| 1 | 2.5a; 2.5e with test code | 1 + ≤2 of 2, 3, 9, 14, 15, 16, 18 | one per candidate | typecheck, build, tests |
| 2 (default) | all; 2.5b exported only | 1 + ≤4 of 2-12, 14-16, 18 | one for all candidates | typecheck, build, tests |
| 3 | all | ≤6 of 1-18, as below | one per candidate, rolling pool of 4 | typecheck, build, tests |

- Every level runs Steps 1, 1b, 2, 2.4, 2.5f, 2.6, 3b, 3c and 4; a failing
  typecheck or build in Step 1b ends the review there.
- **Level 0:** no fanout. The parent reviews the diff inline (correctness,
  empty/error/NULL, UX, algorithms, tests, standards) and re-tests the 2.5f findings inline, and admits each candidate inline from
  a blank evidence form before drafting severity, fix or prose. Step 3c still
  launches its risk assessors.
- **Feature changes:** for a `feat` PR (its title type), or without a PR a
  `feat/…` branch, Agent 18 always runs at levels 1-3, outside the cap.
- **Level 3** uses Cypress (rung 5) only when a lower rung cannot decide,
  and headed Chrome (rung 6) only when needed and `--headed` is set. Agent 1
  always; Agent 18 when the change alters what a user sees, reads or does;
  Agent 12 for out-of-diff consumers; Agents 2-8, 10, 11, 14, 15 when their
  domain is touched; Agent 9 when production behavior changes; Agents 16, 17
  for changed tests or a fix claim; Agent 13 when a separate adversarial pass
  is warranted. Depth comes from evidence, not agent count.

Open with "Reviewing <target> at level <N> with <model>, thinking <level>,
review-pr 2.0". Use client-reported model and effort; if not available say
`model unknown` or `effort unknown`. If defaulted, mention that level 3 exists.

## Native review agents

Use Codex's native `spawn_agent` with `agent_type` `explorer` for discovery,
`review-prober` for falsification, `risk-assessor` for risk. Explicitly set
`fork_context: false` on the classic schema (or `fork_turns: "none"` if that
field is exposed instead). Spawn anew for every assignment and retry;
never resume a child or send the parent transcript. Use `high` effort for
explorer and at most `xhigh` for other roles.

Wait on active IDs with the native wait tool (`wait` or `wait_agent`, as
exposed); consume only finished results and call `close_agent` on each
consumed ID before refilling the pool. Completed open threads count against
capacity. A wait timeout means work may still be running. Require a native
toolset with named role selection, explicit fresh context, wait and close;
if your mode lacks these, stop with `NOT RUN` rather than switching clients
or doing required leaf work inline.

Standalone needs one layer; the cycle needs two. A trusted checkout's
`.codex/config.toml` sets `agents.max_depth = 2`. If it is not loaded or is
overridden, check effective depth and tools before starting. On versions
accepting that key the user can start a new session with
`codex -c agents.max_depth=2` if appropriate; don't edit their settings or
bypass policy. Keep at most four leaves open, or fewer if
`agents.max_concurrent_threads_per_session` (legacy `agents.max_threads`)
or other open threads leave less room. Count the live cycle runner. If no
slot is available even after consuming and closing finished threads, stop.

Each child gets a self-contained task, pinned SHA(s), and only the inputs
below. Give source and artifact paths as absolute paths; read pinned
scratch source, not the user's working tree or a moving branch. Never give
out the private history directory or preload earlier role context.

- **Step 3 discovery:** one static read-only agent per selected role; no
  probes or edits. Give the saved diff, title and body, 2.4 verdicts,
  `<RV>/surface.md`, the full Known bug classes, role text and discovery
  directive; Agent 13 gets only its narrower inputs, no map or PR body.
  Give Agent 9 the Vitest coverage after `<RV>/test-run.exit` exists.
- **Step 3b falsifiers:** `review-prober` per the level table. Give only Step
  3b inputs. Budget 30 minutes from the first probe execution, not including
  slot waits. The level-2 batch gets 10 minutes per candidate (at least 30).
  Mark probes beyond budget `unknown` and still return each required form.
- **Step 3c risk:** `risk-assessor`, one per rated finding; only Step 3c
  inputs. It does not run tests.

Allow 30 minutes for discovery and 60 minutes for risk as workflow budgets,
not native tool parameters. Do not treat timed-out or interrupted work as
finished. Confirm stopped commands are gone before releasing locks or
removing their worktrees. The parent owns role selection, the private
ledger, admission, severity, risk and report.

## Running heavy commands

The review box has about 15 GB, of which agents and the harness hold about
4.5 GB, and the host can take more back at any time. So every heavy command
of the review, its agents and review-cycle fixers runs inside **one machine-wide budget of
9 units** (about 1 GB each), shared with every other review, repo and
worktree on the machine:

```bash
node "$REPO/scripts/with-slots.mjs" <weight> -- <command>
```

| Job | Weight |
|---|---|
| `yarn install`, `yarn add` | 2 |
| Vitest on explicit test files, `--maxWorkers=1 --minWorkers=1` (a probe) | 1 |
| `vitest related` (avoid: a shared util pulls in most of the suite) | 2 |
| Full suite, with or without coverage, `--max-workers 4` | 3 |
| `yarn typecheck` | 3 |
| `yarn build` (includes the checker's tsc) | 4 |
| `vite preview` of a built `dist` | 0 |
| Cypress spec | 2 |
| QuestDB server for Cypress | 2 |
| Headed Chrome probe (rung 6) | 3 |
| Vite dev server (loads the type checker) | 3 |

- **Checker:** the wrapper adds 1 to a job that runs Vite, Vitest or a build
  while the `vite.config.mts` of its working
  directory starts `vite-plugin-checker` with no `process.env.VITEST` guard,
  and logs it. Pass the table's weight.
- **Waiting is normal.** "waiting for a free slot (normal, do not cancel)"
  means wait; the wrapper never fails for lack of budget, never runs a job
  before its weight fits, and prints the holders every 5 minutes. A wrapped
  command that calls the wrapper again runs at once, inside its parent's
  slots.
- **Tests:** name the test files; prefer them to `vitest related`, and when
  related would pull in a large share of the suite, rely on the parent's full
  run instead. Call Vitest as `TZ=UTC yarn vitest run <files> --maxWorkers=1 --minWorkers=1`
  (`yarn test` sets `TZ=UTC`; a direct call does not).
- **Only the review's parent runs the full suite,** once per round (Step
  2.6). Subagents never run `yarn test` or the whole suite.
- **Long runs detached:** start the full suite, the gates and Cypress in the
  background with output to a file (`nohup sh -c '<cmd>; echo $? >
  <file>.exit' > <file> 2>&1 &`, `setsid` on Linux, which macOS lacks) and
  poll the exit file. With `exec_command`, retain the running session ID
  and use `write_stdin` to wait/drain it when available. `yield_time_ms`
  is not a process timeout; yielding does not mean the command exited.
  The host may pause for 10–35 minutes. Before restarting a run, confirm
  the old process has exited and clear the old exit file; no duplicates.
- **Killed runs are "not run",** never passing and never failing: exit 129
  (SIGHUP: the session went away) or 137 (SIGKILL, usually OOM; on Linux
  `dmesg` shows "Killed process", on macOS rely on the exit code). Re-run
  alone through the wrapper. Never skip a test or call it verified because
  its run was slow, waited or died; report it as not run until it runs.
- **Never speed Vitest up** with `isolate: false`, the `vmThreads` pool or
  `deps.optimizer`: each breaks 50-130 test files.

## Step 1: Gather context

`RV=$(mktemp -d /tmp/review-pr-XXXXXX)`, `REPO=$(git rev-parse --show-toplevel)`,
`HIST=$(mktemp -d /tmp/review-pr-hist-XXXXXX)`. Every mode ends with
**`$BASE`** (what the change is measured against) and **`$REV`** (the
reviewed revision) set; Steps 2.4, 2.6 and every base check need them. Save
comments, threads, `--prior` and `--settled` files to `$HIST` **unread**
(Step 2.5f); never name `$HIST` in any task.

**GitHub PR:**

```bash
PR='<PR number or URL from $ARGUMENTS, other tokens removed>'
gh pr view "$PR" --json number,title,body,labels,state,url,baseRefName,baseRefOid,headRefOid > "$RV/pr.json"
# Skip this whole block with --fresh.
gh pr view "$PR" --comments > "$HIST/comments.md"
# Review-thread replies on the diff, which --comments leaves out:
PR_API=$(jq -r .url "$RV/pr.json" | sed -E 's#https://github.com/([^/]+/[^/]+)/pull/#repos/\1/pulls/#')
gh api "$PR_API/comments" --paginate --jq '.[] | "\(.user.login) on \(.path):\(.line // .original_line): \(.body)"' > "$HIST/threads.md"
# With --range, skip this revision block.
BASE=$(jq -r .baseRefOid "$RV/pr.json")
NUM=$(jq -r .number "$RV/pr.json")
git fetch origin "pull/$NUM/head" "$(jq -r .baseRefName "$RV/pr.json")"
REV=$(jq -r .headRefOid "$RV/pr.json")
```

Validate both captured SHAs as commits. If a pinned object is unavailable
after fetch, return `NOT RUN`; never substitute a newer ref. For a PR or
committed range, set `BASE` to `git merge-base "$BASE" "$REV"` so every
stage sees the same comparison. Do not use a live `gh pr diff`.

**PR with a range:** use the PR for metadata only (and history unless
`--fresh`); do not fetch its head or use its SHAs. Use the local pinned
range for all code and honor `--body` as usual.

**Committed range, commit, or `staged`:**

```bash
# Committed range
BASE=$(git rev-parse '<base from --range>'); REV=$(git rev-parse '<head from --range>')
git diff "$BASE...$REV"
# Commit hash
BASE=$(git rev-parse '<hash>~1'); REV=$(git rev-parse '<hash>')
git diff "$BASE" "$REV"
# staged: the index as a commit on HEAD, as unreferenced objects
BASE=$(git rev-parse HEAD)
REV=$(git commit-tree "$(git write-tree)" -p "$BASE" -m 'review-pr: staged')
git diff "$BASE" "$REV"
```

**Working-tree range (`--range=<base>..`) or `unstaged`:** use a temporary
index to snapshot tracked unstaged edits and only the untracked files belonging
to the change (including new tests). Inspect `git status --short --untracked-files=all`
first. Do not include local notes or unrelated files.

```bash
set -e
INDEX_TREE=$(git write-tree)
COMPARE=$(git rev-parse HEAD)
# For unstaged, compare against the original index, not HEAD.
if [ "$MODE" = unstaged ]; then
  BASE=$(git commit-tree "$INDEX_TREE" -p "$COMPARE" -m 'review-pr: index')
  COMPARE=$BASE
fi
# For a working-tree range, set BASE to the requested base SHA before this block.
SNAP_INDEX="$RV/snapshot.index"
GIT_INDEX_FILE="$SNAP_INDEX" git read-tree "$INDEX_TREE"
GIT_INDEX_FILE="$SNAP_INDEX" git add -u -- .
# Populate this Bash array with the selected paths from git status.
UNTRACKED=()
if [ "${#UNTRACKED[@]}" -gt 0 ]; then
  GIT_INDEX_FILE="$SNAP_INDEX" git --literal-pathspecs add -- "${UNTRACKED[@]}"
fi
TREE=$(GIT_INDEX_FILE="$SNAP_INDEX" git write-tree)
REV=$(git commit-tree "$TREE" -p "$COMPARE" -m 'review-pr: working tree')
git diff "$BASE" "$REV"
```

Run from the repo root; set `MODE=unstaged` or `MODE=working-tree` as
appropriate. Stop with “nothing to review” if this diff is empty. The
snapshot works even when the only changes are untracked files. It leaves
the real index's staged entries, refs and working tree unchanged. Without
a PR, skip Step 2 and say so.

Save `git diff "$BASE" "$REV"` as `$RV/diff.patch` once both are pinned.
For `--fresh`, do not inspect branch logs, other transcripts or review
history, even if available. This applies to the runner and all its roles.

**Each shell call may be a new shell.** Use Bash for these snippets. Once
`$REV` is set, write
`printf 'export RV=%q REPO=%q BASE=%q REV=%q HIST=%q\n' "$RV" "$REPO"
"$BASE" "$REV" "$HIST" > "$RV/env.sh"` and start every later block with
`. <absolute path>/env.sh`. Give subagents absolute paths, never `$RV` or
`$REPO`; `<RV>` and `<REPO>` below stand for them.

## Step 1b: Typecheck and build, once, first

The review parent is the only publisher. Use `scripts/review-build-cache.mjs`
from `$REPO`, not a worktree under review. Its key is the artifact kind,
full commit SHA and effective build profile; a miss runs the command after
`--` and publishes a copy only on successful exit and artifact validation.
Stdout is the selected path; diagnostics and producer logs go to stderr.
Use published paths read-only. Never publish from a probe, fixer, or any
edited checkout, including ignored local inputs. A synthetic index/working
snapshot checked out at its own `$REV` is not the live working tree.

Use the standard review recipes below, without custom build flags or copied
local `.env`/dependency files. The helper rejects local Vite env files not
pinned by the requested revision. It keys common environment overrides
and platform/toolchain inputs. If other effective build inputs differ or
cannot be shown to match (e.g. changed user config, tool install or resolved
dependencies), use `$RV/build-cache` instead of the shared directory; isolate
incompatible profiles within the review as well. Do not reuse live
worktrees, test output, coverage or logs from another attempt.

A change that does not typecheck or build is not worth reviewing. Right after
Step 1, create the head worktree and start both checks in the background, in
parallel, at every level; then go on with Steps 2-2.5 while they run.

```bash
. <RV>/env.sh
WT="$RV/head"
git worktree add --detach "$WT" "$REV"
git worktree add --detach "$RV/base" "$(git merge-base "$BASE" "$REV")"
cd "$WT" || exit
node "$REPO/scripts/with-slots.mjs" 2 -- yarn install --immutable || exit
# Set BUILD_CACHE from the internal flag first; otherwise unset it. Do not
# inherit a cache path from the ambient shell.
BUILD_CACHE=${BUILD_CACHE:-"$RV/build-cache"}
CACHE_TOOL="$REPO/scripts/review-build-cache.mjs"
YARN_VERSION=$(yarn --version) || exit
UI_PROFILE="ui-yarn-build-v1:$YARN_VERSION"
export BUILD_CACHE CACHE_TOOL UI_PROFILE
printf 'export BUILD_CACHE=%q CACHE_TOOL=%q UI_PROFILE=%q\n' \
  "$BUILD_CACHE" "$CACHE_TOOL" "$UI_PROFILE" >> "$RV/env.sh"
nohup sh -c 'node "$REPO/scripts/with-slots.mjs" 3 -- yarn typecheck; echo $? > "$RV/typecheck.exit"' > "$RV/typecheck.txt" 2>&1 &
nohup sh -c 'node "$CACHE_TOOL" "$BUILD_CACHE" ui "$REV" "$UI_PROFILE" -- \
  node "$REPO/scripts/with-slots.mjs" 4 -- yarn build > "$RV/head-dist.path"; \
  echo $? > "$RV/build.exit"' > "$RV/build.txt" 2>&1 &
```

Before Step 2.6 starts any test, wait for both exit files.
- **Both pass:** go on. Typecheck always runs; only a validated exact-key
  hit can skip the build. The hit is recorded in this attempt's `build.txt`
  and the chosen path in `head-dist.path`. No later step or leaf rebuilds
  head. Resolve base `dist` only for a browser probe (Step 3b, rungs 5-6).
- **Either fails:** a non-zero exit whose output holds a compiler or bundler
  error (`error TS`, a Vite or Rollup error naming a file). **Stop the
  review.** Run nothing else: no tests, no agents. Report only the opening
  line, one Blocking finding per failing check (Problem, the first errors
  from its output with file and line, `blocks by rule: failing check`), and
  the verdict **request changes**. When the build fails only with the
  TypeScript errors typecheck reports (`vite-plugin-checker` type-checks
  during the build), file one finding for both. Stop remaining checks and
  remove the worktrees.
- **Infrastructure failure:** any other non-zero exit, such as with-slots
  usage (2), a spawn failure (127), `MODULE_NOT_FOUND`, or an install error
  the PR's lockfile did not cause: fix it and re-run; never a finding.
  Preserve the original log and exit before retrying. Exit 129 or 137:
  not run; run that check again ("Running heavy commands").
- **Fanout blocked or incomplete:** at every level with required agents
  (including Step 3c at level 0), if any required role cannot launch fresh
  or fails to return a valid required result, do not substitute inline
  work or claim a clean review. Drain or stop the work safely. Remove only
  worktrees no agent or command can still write to; retain the others and
  report their paths with `NOT RUN: <stage, role and exact failure>`. Use
  `NOT RUN` for unrecoverable gate infrastructure too.

## Step 2: PR title and description

Check the title, body and labels (`--body` replaces the body). Read the title
as a user scanning release notes, the body as a reviewer who has not opened
the diff.

- **Format:** Conventional Commits **without a scope**, `type: description`;
  the description states the effect and does **not** repeat the type: `fix:
  show the grid's new rows after a cancelled query`, not `fix: fix grid stale
  rows`.
- **Type:** a change users see (data, behavior, settings, errors, persisted
  formats, agent tools, anything breaking) is `feat`, `fix` or `perf`; flag a
  technical type on it and name what users see.
- **User-facing title** (`feat`, `fix`, `perf`, `docs`): states the effect the
  user gains, with no component, hook or file names, mechanism or jargon.
  Good: `fix: stop notebook charts drawing a partial result as complete`;
  avoid: `fix: check the partial flag in buildEchartsOption`.
- **Technical title:** makes the reason for the change obvious; flag one that
  only says what changed.
- **Body:** one bullet per net effect against the base branch, ≤15 words, with
  `Fixes #NNN` on its bullet; then the approach, one to three sentences per
  fix or feature (root cause or design). Fixing a bug the PR itself introduced
  is no effect. Flag:
  - a bullet that describes code instead of an effect;
  - an effect no bullet states, above all a regression or a break (a
    persisted format old versions cannot read, a tool schema a released MCP
    server does not expect);
  - a claim the diff does not support; a fix or feature with no approach;
  - a slowdown or tradeoff without its measured size; a speed change without
    before/after;
  - selling: superlatives, bold numbers;
  - **hashes or counts**: a commit hash, a tandem head, a submodule pointer, a
    count of tests, files, lines or commits; ask for removal unchecked;
  - test plans, coverage, probe output, case lists, "Not changed" lists, file
    walkthroughs, design narrative beyond the approach. Never ask for these.
    A screenshot or short recording of a visible change is fine.
- **Tandem PRs:** linked on one line by number.
- **Deferred findings** (Step 3c) are no effects: never ask for one in the
  body or name one in this section.
- **Labels**, when present, match: `bug` on `fix`, `enhancement` on `feat`;
  `notebooks`, `security`, `Enterprise`, `tandem` where they apply. No labels
  is fine. Bundled related fixes are fine; never demand a split.

Leave out what a person declined (Step 2.5f). For everything else write a
ready-to-paste title and body. Finish once the review knows what the diff
does; report under **Title and description** (Step 4).

## Step 2.4: Submodule provenance (mandatory at every level)

`test/e2e/questdb` pins the QuestDB server for browser tests. Classify each
pointer move before reviewing inside it:

```bash
. <RV>/env.sh
git -C "$REPO" diff "$BASE" "$REV" --submodule=short \
  | grep -E '^(diff --git|[+-]Subproject commit)'
```

Only when that prints a `Subproject` line:

```bash
. <RV>/env.sh
cd "$REPO/test/e2e/questdb" && git fetch origin --quiet
DEF=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null \
  | sed 's|^origin/||')
git merge-base --is-ancestor <new-sha> "origin/$DEF"
case $? in 0) echo UPSTREAM-SYNC;; 1) echo OFF-DEFAULT;; *) echo UNRESOLVED;; esac
```

- **UPSTREAM-SYNC:** on the default branch; its content is out of scope. The
  only finding is an integration defect in this diff, such as a browser test
  needing server behavior the pointer lacks.
- **OFF-DEFAULT:** only on a feature branch; review it as part of the change.
- **UNRESOLVED:** no network or checkout, or any other git error; treat as
  OFF-DEFAULT and say the scope was decided without provenance.

Record the verdict in one line; repeat it in Step 4.

## Step 2.5: Map the change surface

Use recorded `rg`/`fd` calls, never memory. Write 2.5a-2.5e to
`$RV/surface.md`: private evidence for discovery and falsification.

- **2.5a Semantic delta.** For each changed or added component, hook,
  function, query or client method, context value, Redux action, reducer,
  selector or epic, Dexie table or migration, persisted or wire format, agent
  tool or schema, styled component, type or constant: symbol and file;
  **before** and **after** (props and arguments, required or optional, and
  defaults; return or render shape; query result nullability and shape; side
  effects: requests, SQL, storage writes, EventBus emits, tool results;
  referential stability; controlled or not; loading/empty/error contract;
  ordering, idempotency; disposables); and a one-line **delta**. "Refactored"
  or "simplified" is no delta; "no behavioral change" only after checking.
- **2.5b Consumer inventory.** For every changed exported symbol, a recorded
  `rg` for every consumer outside the diff, by file: JSX users; callers of the
  hook or client method (`quest.queryRaw`, `quest.abort`, `quest.abortActive`,
  `client.*`); `useContext` and `useSelector` consumers, reducers and epics of
  changed actions; Dexie readers and writers and schema-version dependents;
  the dispatcher, AI and MCP surfaces and schema entry of a tool;
  `eventBus.on` subscribers and emitters; tests. A changed exported symbol
  with no recorded `rg` is a skill violation; never assert "only used here"
  without the search.
- **2.5c Implicit contracts,** before vs after, one line each: props and
  arguments required vs optional, and defaults; can it return
  `null`/`undefined`; **query result contract** (columns, order, row count,
  empty, error, timeout, partial or capped); nullability of fields; side
  effects (requests, SQL, storage, navigation, emits, data sent to an agent or
  LLM); disposables (timers, subscriptions, AbortControllers, listeners, Monaco
  models); callback order and count; idempotency and re-entrancy (rapid
  clicks, repeated calls, abort then restart, user edit during an agent
  write); controlled vs uncontrolled; Redux action, state and selector shapes;
  **persistence** (Dexie version, table shape, migration, import/export format
  version); referential stability; loading, empty, error and waiting states.
- **2.5d Cross-context exposure:** places the change is visible from that the
  diff does not touch: rendering parents, result and context consumers, effect
  deps holding the value, memoized children, persisted-format readers, agent
  and MCP surfaces, route and lazy-load boundaries, EventBus subscribers. Step
  3 reviews every entry.
- **2.5e Test inventory** (only with test code; feeds Agents 9, 16, 17):
  reusable helpers and fixtures (`src/test`: `renderComponent`, `findHook`,
  `requestUrl`, `stubBrowserGlobals`, `nativeAbortSignals`; `__fixtures__`;
  `test/integration/<feature>`; `test/e2e/commands.js`, `test/e2e/fixtures`);
  a "reinvented helper" candidate needs its helper in this list; changed
  shared helpers get a 2.5b inventory; the production symbols each new or
  changed test exercises.

## Step 2.5f: Earlier findings

**History-free discovery.** Re-reviews that see earlier results anchor on them
and miss new bugs. So discovery never receives PR comments, review threads,
earlier findings, settled items, `--prior` files or any earlier report, not
even as "known, skip". The parent reads `$HIST` only **after discovery
returns** (level 0: after the inline pass).

- **Settled:** an item a person declined (won't fix, by design, accepted,
  out of scope, left for later) or disputed with a reason, and each decision
  in the `--settled` file. Never re-test or raise it anywhere in the report,
  even if it reproduces. Write it, with a link to the reply or the file, to
  `$HIST/settled.md`. At ledger time, a candidate that restates it (same
  problem, same place, however found) is `OMITTED settled`. Only another
  symptom, or a later commit making it worse, is new.
- **Other earlier findings:** one line each in `$HIST/earlier-findings.md`:
  trigger, claimed symptom and size, claimed fixing commit. A claimed fix is a
  hypothesis. Each enters the Step 3b ledger as a candidate (merged with a
  discovery candidate stating the same problem) and goes to **falsifiers
  only**, with a neutral proposition (trigger and claimed symptom; no verdict,
  no claimed fix), re-run at `$REV` and at the merge base. Level 0 re-runs
  them inline. One that no longer reproduces needs no report line.

The Step 4 admission audit checks this.

## Step 2.6: Tests and coverage

At levels 1–3, the parent runs Vitest once in the head worktree from
Step 1b, with its built-in coverage report. This is also the test gate
(Step 3b). At level 0, inspect relevant tests inline; no full suite is
required.

```bash
. <RV>/env.sh
cd "$RV/head" || exit
# Test-only dependency for older revisions, after both build/typecheck gates.
[ -d node_modules/@vitest/coverage-v8 ] || node "$REPO/scripts/with-slots.mjs" 2 -- \
  yarn add -D "@vitest/coverage-v8@$(node -p 'require("vitest/package.json").version')" || exit
nohup sh -c 'node "$REPO/scripts/with-slots.mjs" 3 -- env TZ=UTC yarn vitest run \
  --maxWorkers=4 --minWorkers=1 --coverage --coverage.reporter=text \
  --coverage.all --coverage.include "src/**/*.{ts,tsx}"; echo $? > "$RV/test-run.exit"' \
  > "$RV/test-run.txt" 2>&1 &
```

Read the uncovered files and lines in the Vitest output and check them
against the diff. Inspect the tests for meaningful assertions: a line
running is not proof the behavior was checked. Report only meaningful
gaps in changed behavior, with the affected path, the consequence if it
regresses, and the smallest useful test. No coverage table, percentage
target, or explanation for every uncovered line. Cypress does not count
toward Vitest coverage. Use the test layers in `web-console-tests`.

A gap is Critical only if it leaves a reachable path to wrong or lost
data, an unintended write, a security failure, or a broken console
unprotected. Prove that impact with a focused ordinary-behavior probe (for
security, use defensive source evidence only) and apply Step 3c.
Bounded exposure is Moderate; cosmetic, unreachable or exotic paths are
not gaps merely because they did not run.

For base and probe worktrees, link `node_modules` from `$RV/head` if their
`package.json` and `yarn.lock` match; otherwise run
`node "$REPO/scripts/with-slots.mjs" 2 -- yarn install`.

## Step 3: Change-specific candidate discovery

Launch only roles whose domain the change materially touches, within the
level's cap. Agent count is never evidence. Inputs: "Native review agents".

### Candidate-discovery directive (applies to all agents)

- For possible security weaknesses, inspect only defensive source evidence.
  Do not design attack inputs, exploits or reproduction steps. This overrides
  the reproduction instruction below.
- You are a **hypothesis generator.** Return atomic propositions; no severity,
  fix, persuasive title, or "verified", "proved", "confirmed". Role text that
  names a finding says what to inspect.
- **Look outside the diff first.** The most valuable bugs are in unchanged
  code that relies on something the diff changed. Before you call a changed
  symbol correct, go through its consumers (2.5b at levels 2-3; at level 1,
  a recorded `rg`) and say, for each one, whether it still works with the
  new behavior.
- Cite the changed hunk, or the unchanged consumer plus the broken 2.5c
  contract.
- **Name the producer** that creates every trigger condition, or write
  `producer: unknown`. If the only producer is crafted input, say so and where
  you looked for a legitimate one (hostile-input rule).
- Give the path, the symptom and the code evidence with file and line. You run
  nothing: mark head and base observations, and anything unchecked, `unknown`.
- **Draft the steps to reproduce:** numbered steps a reviewer can follow in
  the console, from a fresh session to the symptom. Give the state to seed
  (settings, notebook, a connected agent and its permission), each click, key
  or agent tool call, and what the user then sees. Mark a step you are unsure
  of `unknown`.
- **Seek disproof** (the list in Step 3b) and record the strongest.
- **Universal negatives** (never, only, exactly one, no retry) need an
  exhaustive consumer and event-source inventory.
- **Dependent propositions** are evidence for their parent, not candidates,
  and fall with it.
- **No pre-existing bugs:** same-trigger behavior unchanged or better than
  `$BASE` is never a candidate ("Keep the blast radius of the change small").
- **No history:** you receive none (Step 2.5f).
- "Known bug classes" are prompts, not findings. Two agents with the same
  reasoning are one hypothesis. No candidate beats a speculative one.

### Agents

A catalog; launch only what the level and surface allow. Admission rules are
by claim type, whatever role found the candidate (Step 3b).

**Agent 1 — Data integrity** (highest stakes). What renders query data (grid,
charts, ECharts options, schema tree, notebook cells, AI chat result views)
and how queries are built and handled (`src/utils/questdb/client.ts`,
`queryExecution*.ts`, `src/providers/QuestProvider`, `src/scenes/Result`,
`src/components/ResultGrid`, `src/scenes/Schema`): empty, error, timeout and
aborted results; **empty, failed and waiting states shown distinctly**;
**row-capped or partial results never drawn or summed as complete** without
a visible mark, refused or flagged in one place, not per consumer; column
parsing and types; wrong-column or off-by-one indexing; assumed non-empty or
fixed shape; value fidelity (LONG past 2^53, DECIMAL scale, timestamp
precision and zone, NULL vs "" vs 0, binary, arrays); **a click writes the
value typed by its column's SQL type**, never a label or formatted string;
malformed or unintended SQL. Any path where the user could see wrong data,
or no data without an error, is the top inspection priority.

**Agent 2 — React correctness and hooks.** Hook rules (conditional hook
calls), stale closures, wrong or needless deps, missing cleanup (timers, subscriptions, AbortControllers,
listeners; Monaco models, decorations and commands in
`src/scenes/Editor/Monaco/**` and notebook cell editors), state updates after
unmount, misused refs, broken controlled/uncontrolled patterns, a wrong `key`
that loses state, event handler reference stability, needless
`requestAnimationFrame` or layout effects. Check the reviewed revision's
React version and root API. React 17 does not automatically batch updates
outside React event handlers. React 18+ with `createRoot` also batches
updates in promises, timers, epics and native listeners: do not assume the
DOM or an effect-synced ref has updated immediately after a `setState`.
Refs that advance before render must stay consistent with each other.
On React 19, function components ignore `defaultProps`, transitions must
use `nodeRef` instead of `findDOMNode`, and `ref` is a regular prop.
A `setTimeout` used only to defer a state update is a smell.

**Agent 3 — Async, timers and cancellation.** Timers, requests, streams and
epics anywhere, including `src/store/epics.ts` (check the installed
redux-observable and RxJS versions at the reviewed revision) and
the AI Assistant (`src/providers/AIConversationProvider`,
`src/scenes/Editor/AIChatWindow`, `src/components/SetupAIAssistant`:
streaming, stop, partial output, tool calls). `setTimeout`/`setInterval`
uncleared on unmount or before re-scheduling; a query re-fired into a
single-slot result surface (editor grid, notebook cell) without
`quest.abort(queryId)`, `quest.abortActive()` or run cancellation, so a late
response overwrites a newer one (not independent background queries: schema
tree, table details, autocomplete, build version); responses landing after
unmount; raw `fetch()` outside the client (AI streaming, settings) without an
`AbortSignal`; rapid repeats firing duplicate or out-of-order requests; epics
(`ofType`, `switchMap` vs `mergeMap`, an error that kills the stream, missing
`takeUntil`); subscription leaks; **an async completion bound to the session
and draft that started it** (no apply after a notebook switch, drawer close or
new edit).

**Agent 4 — State and context.** `src/store` reducers, selectors and actions,
`src/providers/*`, `src/modules/EventBus`: action and reducer correctness,
immutable updates; a provider `value` fresh every render with consumers that
observably re-render; contexts split so unrelated consumers do not re-render
together; prop drilling where context is cleaner, and context where a prop
suffices; EventBus usage where touched; missing loading and error states in
state-derived UI; **one decision, many readers**: two paths
deciding the same thing (pane and agent report, two saves, grid and export)
that can drift.

**Agent 5 — Persistence and migrations.** `src/store` (`db.ts`,
`migrations.ts`, `compression.ts`, `buffers.ts`, `notebook*.ts`),
`src/scenes/Editor/Monaco/importTabs.ts`, `exportTabs.ts` and their consumers:
schema version bumped with a table shape; migrations upgrade, never drop;
quota and corrupt records handled; lossless round trips; readers tolerate old
and missing fields; no main-thread stall on large payloads; **a save writes
only what the user changed**, and a no-change save writes nothing.

**Agent 6 — Performance at scale.** Missing memoization that matters, or
memoization that prevents nothing; context re-render storms; no
virtualization (`react-virtuoso`) for large results, long lists, the schema
tree; ECharts or uPlot re-inits where an update would do; inline object,
array or function props that break referential equality; expensive
computations without memoization; excess requests or IndexedDB writes. **Algorithms:** state
the complexity of loops and lookups in render, effects, selectors, parsing and
chart building; flag a linear `.find`/`.includes`/`.filter` where a
`Map`/`Set` fits, nested scans over rows, per-render rebuilds, re-parsing,
fusable passes. **Data-size budgets:** no `Math.min/max(...spread)` over data;
cost linear in rows; a display cap stated, not silent. State each
candidate's magnitude (magnitude rule); a candidate without one cannot be
classified. Return every slowdown the PR body
states, with its size, for measuring at head and base.

**Agent 7 — Styling, theming and design language.** Does the new UI look and
behave like the rest of the console?

- **Reuse:** a new component, styled wrapper or pattern where `src/components`
  has one (`Button`, `IconButton`, `Box`, `Text`, `Dialog`, `Drawer`,
  `DropdownMenu`, `SelectMenu`, `SearchableSelect`, `Tooltip`, `Badge`,
  `Switch`, `SegmentedControl`, `Input` and the rest); a plain button or flex
  div where `Button` or `Box` fits. Name the component to use.
- **Design language:** compare with the nearest existing screen of the same
  kind (a drawer, a menu, a settings row, a toolbar, an empty or error state)
  and cite it: surfaces and borders, spacing, radius, typography, control
  heights, icon set and sizes, placement of actions. A new look for an
  existing kind of element is a finding.
- **Color:** theme tokens chosen by their role as `src/theme/THEMING.md`
  defines (surface hierarchy, contrast between neighbors, composition rules),
  in both themes; hardcoded colors and sizes (`yarn lint:colors`, which
  the review does not run, catches only literal colors); text failing contrast in either theme.
- **Mechanics:** specificity and z-index conflicts; animating layout instead
  of `transform`/`opacity`; styled components created in render; conditional
  styles without `css`; style props without `$`; `px` where `rem` is used;
  inline styles; custom SVGs where the icon library has one.

**Agent 8 — Structure, readability and types.** Long components (above all
growth in large files), duplicated functions or styled components, logic that
belongs in a util (component reuse is Agent 7's); ambiguous names, missing
early returns, opaque regexes, trivial comments, needless IIFEs, `!`, needless
`?.`, optional fields every caller sets, broad types that should be unions,
and **hand-maintained lists** of fields or cases a type or registry should
enforce (`Record<keyof T, …>`, `satisfies`).

**Agent 9 — Test coverage.** Compare the Vitest report with the diff and
read the assertions for materially changed behavior, including the relevant
2.5d contexts. Flag only meaningful gaps (Step 2.6). A fix needs a test that
fails without it; for a class fix, prefer a table-driven test over the
registry. Prefer the cheapest stable layer; use browser tests only for
flows that need them.

**Agent 10 — Accessibility.** Missing ARIA labels on interactive elements;
Radix dialog/popover/dropdown/tooltip usage: correct controlled state, focus
trap, portal/z-index behavior, `Escape`/outside-click dismissal; missing
keyboard navigation support; focus management issues; missing alt text on
images; color contrast concerns; screen reader compatibility; click handlers
without keyboard equivalents; missing error announcements for assistive
technology; broken tab order. Focus that lands on `<body>` after an element
is removed or a panel closes, or that does not return to its opener, is no
finding unless a keyboard user can no longer go on.

**Agent 11 — Browser compatibility and security.** No reliance on APIs
unavailable in target browsers without polyfills; no CSS properties with
limited cross-browser availability; XSS vectors: `dangerouslySetInnerHTML`,
untrusted input through `react-markdown` (outside `SafeMarkdown`) or
`react-highlight-words`, unsanitized HTML, an `href` or image source, an
ECharts option that renders HTML; untrusted content checked at its sinks
(where it renders HTML, navigates or loads a URL), not by key-name allowlists
that miss inherited, nested or aliased forms; SQL injection or unintended SQL
via string-built queries; open redirects via user-controlled URLs in the
OAuth2/SSO flow (`src/modules/OAuth2`); secrets or tokens leaking into logs,
telemetry, URLs or localStorage.

**Agent 12 — Cross-context caller impact.** Walk the callsite inventory from
2.5b. For every callsite, read the surrounding code (the consuming component
or hook plus its callers up two levels) and answer:

- Does this consumer pass props or arguments the new behavior handles
  incorrectly?
- Does it depend on a 2.5c contract the change broke: a query result that can
  now be empty, partial or NULL-shaped, a context value that is no longer
  stable, a prop that became required, a hook return shape that changed, a
  Dexie field that moved or was renamed, a callback that is no longer
  referentially stable, a tool result whose shape changed?
- Is it in a context (effect dependency array, memoized child, list render,
  event handler, async callback, aborted-request path, unmount path, route
  boundary, agent tool call) where the new behavior misbehaves even when the
  inputs are valid?
- For changed query results or client methods: do all consumers still parse
  and render the result correctly?
- For changed context values: do all `useContext` consumers still get a value
  with the expected shape and stability?
- For changed components or hooks: do all render sites and callers handle the
  new props or return shape?
- For changed Dexie tables or migrations: do all readers tolerate data written
  by both old and new versions?

Output per callsite, not per failure mode: SAFE / CANDIDATE /
INSUFFICIENT_EVIDENCE. A CANDIDATE is an atomic hypothesis for Step 3b; it has
no severity yet. Select this role whenever changed symbols have meaningful
out-of-diff consumers: small diffs to widely used symbols have the largest
blast radius.

**Agent 13 — Fresh-context adversarial.** Receives ONLY the diff and changed
file names (no maps, checklist or PR body) and one instruction: "generate a
small set of falsifiable ways this code could be wrong, and try to disprove
each before returning it, using defensive source analysis only for security
weaknesses; never devise attack inputs or reproduction steps." It may read
the pinned source; output follows the directive. Uniqueness is no signal;
overlap is corroboration only with an independent evidence type.

**Agent 14 — Agent tools and MCP.** `src/utils/tools/**`, `src/utils/mcp/**`,
`src/providers/MCPBridgeProvider`, `src/consts/shared-definitions.json`,
`src/utils/ai/**`, the notebook AI bridge: **permission gating** (schema,
read, write) before every action, SQL classification failing closed (a
validate error or an unclassifiable statement counts as a write); **data
reaching the agent and its LLM provider** (results, render reports, snapshots,
error texts, compacted context): without read permission, no row values,
result-derived text or error text quoting data; schemas matching dispatcher
behavior (names, types, limits, defaults, effects); freshness
(`notebookFreshness.ts`) so concurrent user and agent edits lose nothing and
hit the right notebook and cell; pairing token and WebSocket URL validated,
scrubbed from the URL, and never logged or sent elsewhere;
`protocolVersion.ts` compatibility with released servers;
`apply_notebook_state` idempotent; error texts say what to do next without
leaking withheld data.

**Agent 15 — Notebook engine.** `src/scenes/Editor/Notebook/**`
(`cellRefresh/`, `useCellExecution.ts`, `NotebookProvider.tsx`,
`runCancellation.ts`, `notebookScheduling.ts`, `declareUtils.ts`, `globals/`,
`resultHydration/`, `persistCellSnapshot.ts`, `cellVirtualization/`, grid
layout) and `src/utils/notebooks/**`: desired state (SQL, variable values,
Stop) vs observed state (what the shown rows were read with); Stop and cancel
honored for the target they were pressed on; live, variable-triggered and
foreground runs never both live on a cell; no lost refresh; re-selecting the
same value runs nothing on a current cell; variable binding, SQL typing, case
and Unicode, dependencies; snapshot caps, truncated snapshots never shown
complete, snapshot bindings equal its rows'; import/export versioning, round
trip and duplicate identity; layout persistence; **a full redraw keeps view
state** (zoom, pan, legend, scroll) across refresh, theme change and
remount.

**Agents 16-17** run only for changed test code or a fix claim; they get the
diff, the surface map and 2.5e. Tests are not second-class code.

**Agent 16 — Test efficacy and quality.** Vacuous assertions (`expect(true)`,
self-comparison, `toBeDefined()` where the value is known, empty `waitFor`),
no assertion; tests that pass without the change (trace symbol to assertion;
a mock of the code under test counts); happy path only; async mistakes (real
sleeps or wall-clock assertions instead of fake timers and controllable
promises, missing `await`/`act`, swallowed rejections, order assumptions);
unrestored timers, mocks, globals or IndexedDB; DOM rendering where a pure
function shows it; reinvented helpers (name the 2.5e helper or `it.each`);
mocks of internal collaborators instead of the boundary; unreadable tests (no
`// Given`/`// When`/`// Then`, vague names, trivial cases); residue
(`console.log`, commented code, `.only`, `.skip` without reason).

**Agent 17 — Regression-test verification.** For a fix claim: per test, the
production line it depends on and what the assertion does when it is
reverted. Skip for features and refactors.

**Agent 18 — User experience.** Whenever the change alters what a user sees,
reads or does (UI, copy, defaults, errors, flows, agent-facing tool text).
Work from the task, not the code:

1. Name the task, the user and the start state.
2. Walk it at `$REV` and at base, step by step, including empty result,
   error, slow network, Stop, Escape, reload, small window, other theme.
3. First, the four questions that matter most:
   - **Easy to use:** can a user who has never seen the feature use it
     without reading anything? Do the controls, names and defaults say what
     they do?
   - **Short, direct path:** is the common task the fewest steps from where
     the user already is? No detour through a menu, a dialog, a setting or a
     second screen that the task does not need.
   - **Promoted at the right place:** does the user meet the feature where
     and when they need it (next to the data or action it serves), not buried
     in a menu nor pushed where it is irrelevant?
   - **No noise:** does it add only what earns its place? A badge, banner,
     toast, prompt, modal, onboarding step, warning or setting that changes no
     decision the user makes is noise; so is one that interrupts the task or
     repeats what the screen already shows.
4. Then, at each step, these seven:
   - **Truth:** labels, counts, units, time zones, number formats and
     partial/stale/capped markers match the data; a view never looks
     complete, current or successful when it is not.
   - **State:** loading, empty, failed, stopped and done are distinct; a long
     operation is visible and stoppable.
   - **Feedback:** every action shows its result where the user looks; a
     failure says what went wrong and what to do next.
   - **Effort:** sensible defaults; nothing to configure before the first
     use (the path itself is the second question above).
   - **Consistency:** existing wording, placement, flow and keyboard
     behavior; no second way to do the same thing (visual consistency is
     Agent 7's).
   - **Safety:** destructive or expensive actions confirmed or undoable;
     Escape, navigation, reload or a theme change keeps the user's work.
   - **Stability:** no flicker, layout shift, jumping focus or scroll, or
     lost selection on refresh.
5. Cite the existing pattern to reuse (`rg` in `src/components`) and, for the
   path and promotion questions, the shorter route or the better place.
6. Agent-facing text says what happened and what next, in the schema's words.

Each candidate names task, step, what the user sees, what they need and why,
and the cost (wrong conclusion, lost edit, extra steps, a feature users will
not find, an interruption or clutter on every use, dead end). A taste
difference with no named cost is none.

Merge the outputs into a private **candidate ledger**: atomic propositions,
deduplicated by proposition plus evidence, dependencies recorded. Then run
Step 2.5f and add its findings, along with meaningful coverage gaps from
Step 2.6 and the parent's own candidates. **The ledger is complete before any falsifier
starts:** every candidate goes into the one fanout. Only a dependent
proposition a falsifier returns may join later. No prose, severity or fix
yet.

## Step 3b: Independently falsify, prove, and admit candidates

### Quality gates

Typecheck and the head build gate passed in Step 1b; do not repeat them. Lint is
no gate: the pre-commit hook runs it on staged files. At levels 1-3 the test
gate is the Step 2.6 Vitest run. Read `$RV/test-run.exit` and the Vitest
summary in `$RV/test-run.txt` before the falsifier fanout. Level 0 has no
test gate.

- **Not run:** exit 129 or 137, worker failure, or another infrastructure
  error without a test failure. Fix the setup and re-run. If only coverage
  is unavailable, run the suite without it and say coverage was not measured.
- **FAILED:** re-run each failed file alone (`TZ=UTC yarn vitest run <file>
  --maxWorkers=1 --minWorkers=1`, weight 1). Passes alone: no gate failure; name it as
  timing-dependent under Tests and coverage. Fails alone: run it in `$RV/base`.
  Fails there too: pre-existing, no gate failure. Passes there: gate failure.
- **Locale:** if the locale breaks tests that do not touch the change
  (Turkish breaks case-insensitive comparison), re-run only the failed files
  with `LC_ALL=en_US.UTF-8` added, and say so.

**A failing test gate is Critical and blocks by rule,** like a failing
typecheck or build (Step 1b): it is the project's committed standard, fully
proved, admitted without a falsifier, and needs no producer, trigger or
symptom.

### Falsification

`HYPOTHESIS → FALSIFYING → PROVEN → ADMITTED`. Any missing proof, contradiction,
failed reproduction, unsupported producer or omitted premise ends at
`OMITTED`; there is no downgraded state, and "could not disprove" is never
`PROVEN`.

**Static candidates are admitted inline by the parent, never sent to a
falsifier:** a candidate whose every load-bearing premise is in the source at
`$REV` and the base (an unused file or export, a duplicated type or helper, a
style or label value, a hardcoded color, a hand-maintained list missing a
case, a test that a recorded search shows absent with no runtime question
left). The parent fills the admission form with `N/A — static` and the full
source proof, from a blank form, before any prose. Anything that needs an
execution (a runtime shape, a race, a regression-test claim, a coverage gap
whose impact depends on running code) goes to a falsifier.

Falsifiers per the level table, 2.5f findings included in every level's
candidates: at levels 1 and 3, one `review-prober` per atomic candidate; at
level 2, one `review-prober` that receives every neutral proposition and
returns one admission form per candidate; level 0 runs the same protocol
inline. At level 3, run them as a **rolling pool of four**: start four, and
refill as soon as you consume a finished result and close its thread.
Use Step 1b's base source worktree and add `<RV>/probe` detached at `$REV`.
Link or install `node_modules` in base and probe as in Step 2.6. Write
the falsifier contract once per review to `<RV>/falsifier-contract.md`: the
Falsification state machine, the defensive evidence rule, strongest
disproof instruction, Admission fields, Special burdens, Net user impact
and the Executed-evidence ladder,
from this skill. **A falsifier receives only:**

- the neutral proposition (level 2: all of them) and its matching "Checks by
  claim type" entries;
- `<RV>/falsifier-contract.md`;
- the repository path, `$REV`, the merge-base SHA, `<RV>/head`, `<RV>/base`,
  and `<RV>/probe` with its lock rule;
- relevant file names and raw artifact paths;
- probe rules:
  - a probe that only adds a test writes it under `<RV>/head` or `<RV>/base`
    `src/` with a unique name (`src/zz-probe-<id>.test.ts`), runs it with
    `node "<REPO>/scripts/with-slots.mjs" 1 -- env TZ=UTC yarn vitest run
    <file> --maxWorkers=1 --minWorkers=1`, and deletes it before replying;
  - a probe that changes production files (a revert, a mutation) runs in
    `<RV>/probe`, **one at a time**: take the lock with `until mkdir
    "<RV>/probe.lock" 2>/dev/null; do sleep 10; done; echo <id> >
    "<RV>/probe.lock/owner"`, check out the revision it needs, change, run,
    then `git -C <RV>/probe checkout -- . && git -C <RV>/probe clean -fdq &&
    rm -rf "<RV>/probe.lock"` before replying;
  - every run goes through `<REPO>/scripts/with-slots.mjs` and waits when
    it waits; a killed run (exit 129 or 137) is re-run, never reported;
  - never run `yarn typecheck`, `tsc`, `yarn build`, `yarn lint` or the
    whole suite (`yarn test`); cite `<RV>/typecheck.txt` and
    `<RV>/build.txt`;
  - browser rungs use the URL the parent gives;
- its output directory, `<RV>/falsify/<id>/`.

A wait timeout alone does not stop a falsifier or its commands. If the
falsifier still owns `<RV>/probe.lock`, clean the tree and remove the lock
only after the agent is terminal and its commands have exited. If that
cannot be confirmed, stop or drain other probes safely, leave any worktree
still in use and its lock untouched, and return `NOT RUN` with the retained
paths. Do not reuse them on retry.

**It must not receive** the role or step that found the candidate, role text,
the discovery narrative, proposed severity or fix, author identity, votes,
earlier verdicts or claimed fixes, or claims that it was verified.

Its first task is the strongest disproof: a missing producer, an unreachable
interaction, an existing abort or supersede, a guard, memoization, a ref
read, cleanup in a parent, an error boundary, downstream recovery, or equal or
better base behavior. Only a survivor gets affirmative proof.

**Admission fields,** each backed by cited evidence:

- **Attribution:** the changed hunk, or the unchanged consumer plus the
  broken 2.5c contract.
- **Producer:** what creates every trigger condition; a reachable branch is
  not proof that anything produces its input.
- **Reachability:** the full producer-to-symptom path with its guards, aborts,
  retries, memoization and recovery.
- **Head observation:** the executed trigger and result at `$REV`.
- **Base observation:** the same trigger at the merge base, or `N/A — new
  surface` with proof.
- **User symptom:** an independent observable consequence.
- **Steps to reproduce:** the candidate's draft steps, corrected to match what
  the executed trigger did. Each step is either one the probe performed or
  one its setup stands in for (name the seed). A step the probe could not
  stand in for is marked `not executed`. A static finding lists the steps
  that reach the code, or what to open and read.
- **Counterevidence:** the strongest disproof tried and why it fails.
- **Artifact:** command or test, output, revision. Race, ordering,
  stale-response, unmount, persistence, migration and compatibility claims
  always need one.

Source-proved defects (a type error, a standards violation, a disposable never
disposed) mark producer, head and base `N/A — static` with the full source
proof. For a coverage gap, searches prove only the missing test, never
producer, reachability, population or impact. `N/A` is forbidden when a
load-bearing premise is runtime ordering, reachability or impact.

**Special burdens:**

- Compatibility: name the version or path that writes the state; a reader
  guard is no producer.
- Universal negatives: exhaustive inventory plus an executed probe.
- Concurrency: force or observe the interleaving (controlled promises, fake
  timers, marble tests); timing prose is no evidence.
- Regression tests: run at head and with the production hunk reverted.
- An omitted parent premise omits every dependent.
- Execution impossible: record the limitation privately and omit; never fall
  back to confident prose.

**Generic checks** after the form is complete:

1. Read the actual source at the cited lines, not the agent's account.
2. Trace callers, render triggers, and for hooks the deps against what re-runs.
3. **Verify the conjunction:** a chain is as true as its weakest step;
   falsify the load-bearing step first, with an executed artifact when it is a
   runtime-shape claim. Votes are no corroboration.
4. Apply every matching check by claim type, below.
5. **Derive a fix only after admission;** it is type-correct (by reading; never
   run `yarn typecheck`), uses in-scope values
   and closes every admitted path. A plausible fix is no evidence.

**Checks by claim type,** whichever role or step produced the candidate
(Agent 13 and 2.5f included):

- **Data integrity:** trace the result shape the client returns; show the
  consumer can receive the claimed empty, error, partial or NULL case.
- **Stale closure or state:** a stale capture AND a needed fresh value; a ref
  read or a fresh argument makes it `OMITTED false`.
- **Missing cleanup:** something needing cleanup, and an unmount or deps
  change while it is live; a one-shot effect is no leak.
- **Re-render and complexity:** the parent re-renders often enough and
  consumers really re-render (memoization preventing none is no finding);
  complexity needs a multiplier or bound (magnitude rule); timing claims
  (drag, resize, scroll) need rung 6.
- **Race:** falsify "real user actions produce this interleaving" first; a
  missing abort needs both requests competing for one single-slot surface
  (different targets or parallel background queries: `OMITTED false`).
- **Swallowed error:** name the statement that throws; show the `catch`
  receives it (an un-awaited rejection escapes `try`) and that it is reachable
  with the callsite's arguments; check the early-`return` sibling too.
- **Persistence and migration:** check `migrations.ts` and `db.ts`, then
  round-trip old-shape data through the migration in a scratch test
  (`fake-indexeddb`); without it, `OMITTED unverified`.
- **Cross-context:** re-read the callsite and its callers two levels up; the
  broken behavior is reachable from production code.
- **Test efficacy:** re-read the assertion in context. To prove "passes
  without the fix", the test must pass both at head and with the production
  fix reverted in `<RV>/probe`, under its lock. If it fails without the fix
  for the expected reason, it protects that behavior.
- **Coverage gap:** omit exotic paths; verify the search and failure link, try
  to falsify the risk (indirect assertions, types, constrained inputs,
  downstream validation); prove reachability, population and consequence
  before Critical.
- **Agent boundary:** cover ordinary allowed behavior and expected denials
  through `dispatch.ts` or `dispatchMCPTool.ts` with benign synthetic
  fixtures. For a possible exposure or bypass, inspect the source only;
  name the field and its defensive contract, not a payload or reproduction.
- **UX:** observed steps at `$REV` and base (component test, Cypress or headed
  browser, with screenshot or rendered text), or a static proof (a label
  contradicting the code, an error path rendering nothing, a new component
  where one exists). Expectations cite the existing pattern or the data; never
  admit a preference.
- **Design language:** a screenshot of the new UI next to the cited existing
  screen, in both themes (Cypress or headed browser), or a static proof (a
  hardcoded value, a token used outside its role in `THEMING.md`, a new
  component duplicating one in `src/components`). "Looks off" without the
  cited screen is a preference.

**Enumerated candidates are admitted per item,** each with its own trigger and
evidence.

### Executed-evidence ladder

Use the cheapest sufficient rung and name it in the Evidence line.

1. **Gate output.**
2. **Scratch Vitest test on extracted logic** (parsers, query building,
   migrations, compression, reducers, selectors, permissions, dispatch,
   utils): `src/**/*.test.ts` in the worktree (Vitest's include globs), run
   as a probe (weight 1, `TZ=UTC`, `--maxWorkers=1 --minWorkers=1`), then delete. Regression claims: pass at head, fail
   with the hunk reverted.
3. **Scratch Vitest for async orchestration** (epics, client, refresh engine):
   `TestScheduler` marbles for RxJS, controllable promises in forced order,
   fake timers, never sleeps.
4. **Scratch component test (RTL + jsdom)** for layout-free behavior:
   rendering, controlled state, handlers, unmount cleanup, late responses.
   `// @vitest-environment jsdom`, `renderComponent` and
   `src/test/component.tsx`, `src/**/*.test.tsx`; run, then delete.
   Geometry, scrolling, virtualization and Monaco need rung 5.
5. **Targeted Cypress spec (level 3):** Monaco, focus, browser IndexedDB,
   layout, UI interleavings. Reuse `test/e2e/commands.js` and
   `test/e2e/fixtures`; one spec, against `vite preview` of the worktree's
   built `dist` (Step 1b's build; no type checker, weight 0) and the
   QuestDB server the parent runs. Harnesses may set `ELECTRON_RUN_AS_NODE`,
   which breaks Cypress:

   ```bash
   node "<REPO>/scripts/with-slots.mjs" 2 -- env -u ELECTRON_RUN_AS_NODE \
     yarn cypress run --spec <file> --config baseUrl=<preview URL>
   ```

6. **Headed browser (level 3, `--headed`):** interaction timing (drag or resize lag,
   pointer coalescing, scroll jank), which headless Chromium and jsdom miss.
   Playwright from a scratch directory outside the repo, headed Chrome,
   measuring frame times, event counts or `performance.now()` at head and
   base:

   ```bash
   PW=$(mktemp -d /tmp/review-pw-XXXXXX) && cd "$PW" && npm init -y >/dev/null
   node "<REPO>/scripts/with-slots.mjs" 2 -- npm i playwright
   # probe.mjs: chromium.launch({ channel: "chrome", headless: false })
   node "<REPO>/scripts/with-slots.mjs" 3 -- node probe.mjs
   ```

Rungs 5-6: **do not build state through the UI.** Seed `localStorage`,
IndexedDB (Dexie database `web-console`: buffers, notebooks, settings) and
auth directly, then go to the interaction. Browser probes run one at a time.

**Browser environment.** Use a browser only when a lower rung cannot decide.
Only now obtain the base `dist` (when comparing base) and QuestDB JAR. Stop
any previous browser environment first. Use the exact head or merge-base
worktree as `APP`, never a mutation worktree, and set `APP_SHA` to its
pinned full SHA.

- **UI:** head uses the path in `$RV/head-dist.path`. For base, compute
  `UI_PROFILE` with the same recipe in the base (`yarn --version` there).
  In that base worktree, look up
  `node "$CACHE_TOOL" "$BUILD_CACHE" ui "$APP_SHA" "$UI_PROFILE"`.
  On exit 1 (miss), detach a fresh scratch build worktree at `$APP_SHA`,
  install with `with-slots` (2) and `yarn install --immutable`, then repeat
  the lookup there with `-- node "$REPO/scripts/with-slots.mjs" 4 -- yarn build`.
  As for head, capture the selected path, stderr and exit separately in
  `$RV`; another nonzero exit is not a miss. Use the selected path as `DIST`.
- **QuestDB:** take `QSHA` from `git ls-tree "$APP_SHA" -- test/e2e/questdb`
  (require a `160000 commit` gitlink). Select `JAVA_HOME` for JDK 25+ (as in
  `scripts/run_browser_tests.sh`, use `/usr/libexec/java_home -v 25` on
  macOS if needed), export it and prepend its `bin` to `PATH` once for
  this recipe (do not change the UI build's environment). Form the profile
  below and look up before checking out or initializing a submodule:

  ```bash
  JAVA_VERSION=$("$JAVA_HOME/bin/java" -version 2>&1) || exit
  MAVEN_VERSION=$(mvn -version 2>&1) || exit
  QDB_PROFILE="questdb-core-package-local-if-snapshot-v1:$JAVA_VERSION:$MAVEN_VERSION"
  node "$CACHE_TOOL" "$BUILD_CACHE" jar "$QSHA" "$QDB_PROFILE"
  ```

  On a miss, reuse an existing JAR only with independently recorded clean
  build provenance for the same SHA and effective Java/Maven profile. Use
  the same lookup with `--reuse "$CANDIDATE_JAR"` to verify and copy it;
  a matching `Build-Commit-Hash` alone does not prove the profile or that
  the source was clean. If no verified candidate is available (including
  an import the helper rejects), use a separate, fresh scratch UI worktree
  at `$APP_SHA`. Initialize `test/e2e/questdb` there with
  `git submodule update --init --recursive -- test/e2e/questdb`, then `cd`
  into that submodule, never the user's. With Bash:

  ```bash
  CLIENT_VERSION=$(sed -nE 's/.*<questdb\.client\.version>([^<]+)<.*/\1/p' core/pom.xml | head -n 1)
  MAVEN_PROFILES=()
  [[ "$CLIENT_VERSION" != *-SNAPSHOT ]] || MAVEN_PROFILES=(-P local-client)
  JAR_ATTEMPT=$(mktemp -d "$RV/questdb-$QSHA.XXXXXX") || exit
  STATUS=0
  node "$CACHE_TOOL" "$BUILD_CACHE" jar "$QSHA" "$QDB_PROFILE" -- \
    node "$REPO/scripts/with-slots.mjs" 4 -- mvn clean package -e \
      -pl core -am -DskipTests "${MAVEN_PROFILES[@]}" \
    > "$JAR_ATTEMPT/artifact.path" 2> "$JAR_ATTEMPT/build.txt" || STATUS=$?
  printf '%s\n' "$STATUS" > "$JAR_ATTEMPT/build.exit"
  ```

  This builds the core JAR, not the runtime distribution. Use the path
  selected on a successful hit, import or build as `VERIFIED_JAR`. The
  helper checks the manifest against the full gitlink SHA even on hits.
  If a verified JAR or UI build cannot be obtained, keep the failure logs
  in this attempt and mark the browser evidence unverified.

Preview uses a scratch copy of the selected `dist`; remove only the old
`$APP/dist` (no trailing slash: it could be a symlink), never the cache.
Check that `dist` is not tracked and the preview is stopped before replacing
it. Pass the selected JAR explicitly on each start; do not use the script's
fallback or inherit a previous JAR. The parent serves one worktree at a time:

```bash
[ -n "$VERIFIED_JAR" ] && [ -f "$DIST/index.html" ] && \
  [ "$(git -C "$APP" rev-parse HEAD)" = "$APP_SHA" ] && \
  [ -z "$(git -C "$APP" ls-files -- dist)" ] || exit 1
rm -rf -- "$APP/dist" && cp -R "$DIST" "$APP/dist" || exit
BROWSER_DIR=$(mktemp -d "$RV/browser.XXXXXX") || exit
QDB_JAVA="$JAVA_HOME/bin/java" QDB_JAR="$VERIFIED_JAR" \
  node "$REPO/scripts/review-browser-env.mjs" start --app "$APP" --dir "$BROWSER_DIR" || exit
. "$BROWSER_DIR/browser-env.sh"   # QDB_URL, PREVIEW_URL
CYPRESS_STATUS=0
(
  cd "$APP" || exit
  node "$REPO/scripts/with-slots.mjs" 2 -- env -u ELECTRON_RUN_AS_NODE \
    yarn cypress run --spec <file> --config baseUrl="$PREVIEW_URL"
) || CYPRESS_STATUS=$?
node "$REPO/scripts/review-browser-env.mjs" stop --dir "$BROWSER_DIR" || exit
exit "$CYPRESS_STATUS"
```

Record each `BROWSER_DIR` for cleanup. Each start uses a new database and
free ports, never a user server. The QuestDB process holds 2 slots until
`stop`; preview is weight 0. Falsifiers get URLs and any named artifacts
read-only, not cache publication access. Remove the temporary build worktrees using the
same cleanup rules as the other review worktrees.

Below level 3, a claim needing rungs 5-6 is omitted with the limitation
recorded; at level 3 without `--headed`, so is a claim that only rung 6 can
show, and the report lists it as "not verified: needs `--headed`"; its static skeleton (a timer never disposed) may still be filed at
the severity static evidence earns, without the runtime symptom.

### Net user impact

Determine before severity; a behavioral candidate without it is `OMITTED`.

- **Population:** who reaches it: all users, a named feature or flow, a query
  shape, agent users, an enterprise path. "Any user in principle" is none. A
  team- or CI-only population caps at Moderate, except a failing gate. A
  hostile producer is no population (hostile-input rule).
- **Delta vs base** for the identical executed trigger.
- **Magnitude and frequency:** per keystroke, row, query, render, session,
  once.
- **Offsets:** what recovers it first (fresh render, error boundary, retry,
  guard, refetch, workflow), or "none found, searched <where>".
- **Net:** exactly one of **net-negative** (only these admit),
  **net-neutral**, **net-positive**. A coverage-gap row is counterfactual only
  about whether the regression exists, never about reachability or impact.

### Ledger classes

- **ADMITTED in-diff:** all fields proved; the defect is in the diff.
- **ADMITTED out-of-diff-breakage:** all fields proved; an unchanged consumer
  breaks on a contract this change altered.
- **OMITTED pre-existing/not-attributed:** base is the same or worse and no
  new path is exposed.
- **OMITTED hostile-input-only:** all fields proved; the hostile-input rule
  covers it.
- **OMITTED false:** disproved.
- **OMITTED unverified:** a required field, artifact or dependency missing.
- **OMITTED settled:** restates a settled item (Step 2.5f).

Omitted entries stay in the private ledger, never in a downgraded or
"possible issue" section, except that pre-existing and hostile-input-only
entries with producer, reachability and observation proved leave as Adjacent
drafts; false and unverified ones never do. The parent checks every returned
form before Step 4.

## Step 3c: Rate the risk of admitted defects (every level)

Classify the admitted findings with the Step 4 rubric. Rate every Critical
one, coverage gaps included, except those that **block by rule**:

- a failing quality gate;
- an XSS, or a token or secret leak;
- an agent receiving data its permission withholds;
- a permission bypass;
- a write the user did not run.

Moderate and Minor never block and are not rated; Adjacent drafts are not
findings.

One `risk-assessor` per finding, at every level. **It receives** a neutral
account: the admitted proposition, the executed trigger and its artifact
paths, the results at `$REV` and at the merge base, the relevant files, the PR
body, the revision identities, and an output file under `<RV>/risk/`; it finds
the population itself. **Never** the severity, the net impact, the narrative,
the fix or votes. Its impact and likelihood tiers and risk matrix are in
`.codex/agents/risk-assessor.toml`.

**Check each reply:**

- the author's reply is the strongest the code allows, and the code or
  artifacts decide whether it holds;
- the impact is what the artifacts show, not a worse possible one;
- each trigger condition has a tier and evidence;
- the trigger is no more common than its rarest condition;
- the risk matches the matrix.

With `--fresh`, explicitly tell the assessor to use only the designated
pinned source and artifacts, not Git or review history.

Correct by evidence in either direction and look the risk up again: missing
evidence or artifacts showing more means the more common likelihood or worse
impact; a rated consequence or trigger nothing shows means the milder impact
or the rarer likelihood shown. If an assessor's result is missing or
invalid, retry the role once in a fresh context. If it fails again, return
`NOT RUN` rather than inventing a rating.

If the author's reply holds, it is no defect of this change: omit it, or keep
the remainder at its own severity (an avoidable non-regressing cost as a
Minor). Otherwise, rated at or above `--block-at`: **Blocking**; below:
**Deferred**.

## Review checklists

### Known bug classes

Every discovery agent but Agent 13 gets this list. Prompts for where to look,
never findings: each candidate needs its own producer, path and symptom.

- **One decision, many readers:** two paths deciding the same thing (pane and
  agent report, two saves, grid and export) drift; find the second copy.
- **A save writes only what the user changed:** rebuilding the whole object
  from a draft rewrites untouched settings; a no-change save writes nothing.
- **An async completion is bound to its session and draft:** a reply landing
  after a notebook switch, drawer close or new edit must not apply.
- **Row-capped or partial input is refused or flagged in one place:** each
  consumer checking the flag itself may draw a partial result as complete.
- **Untrusted content is checked at its sinks** (where it renders HTML,
  navigates or loads a URL), not by key-name allowlists that miss inherited,
  nested or aliased forms.
- **A full redraw keeps view state:** zoom, pan, legend selection and scroll
  survive a refresh, a theme change and a remount.
- **Agent-facing output honours the permission gate:** tool results, render
  reports, snapshots and error texts carry no data read permission withholds.
- **Data-size budgets:** no `Math.min/max(...spread)` over data; cost linear in
  rows; a display cap stated, not silent.
- **A fallback fails closed:** missing information shows an error or does
  nothing, never a plausible default (a label for the value, 0 for NULL).
- **Hand-maintained lists drift:** a key, fingerprint or switch listing fields
  or cases by hand misses the next one; a type or registry should enforce it.
- **Removing a setting removes its effect:** with `setOption` merge, an option
  key the new build omits keeps its old value; a builder that drops an
  optional key (formatter, min/max, markLine, visualMap, boundingCoords)
  writes it empty or forces a replace.
- **Every option scope:** code that reads, rewrites or reports on an ECharts
  option handles the root, `baseOption`, `options[i]` and `media[j].option`.

### Unresolved TODOs and FIXMEs

For each new `TODO`, `FIXME`, `HACK`, `XXX` or `WORKAROUND`: unfinished work
that should block, or an acceptable known limitation? Verify a cited issue
exists.

### Commit messages

The Step 2 format; a body wraps at 72 columns in the active voice, naming the
acting subject.

## Step 4: Output

Only **ADMITTED** findings appear, plus Adjacent drafts. **Never publish**
omitted candidates, disproofs, retractions, the ledger or the private map, or
agent, candidate or false-positive counts. Finish falsification before
writing; no findings is valid.

**Proportionality:** keep it actionable in one sitting. Past about seven
findings on a normal change, re-run admission and remove dependent, duplicate
and not-attributed entries (the last move to Adjacent).

**Every finding opens with three lines,** written last from its admission
form:

- **Problem:** what is wrong, ≤12 words, no mechanism or fix.
- **Net impact:** population and magnitude, ≤12 words.
- **Evidence:** the decisive artifact or static proof, with the revision.

```
Problem: A cancelled query's late response overwrites the newer result.
Net impact: Editor users who re-run quickly see the older rows.
Evidence: scratch epic test red at abc123, green at base def456.
```

Then **Steps to reproduce** from its admission form: numbered steps from a
fresh console to the symptom, ending with what the user sees, and the probe
to re-run (path and command). Then only the minimal producer → path →
symptom trace, the base comparison and the fix. Open the report with the "Review level" line, then `$REV`, the merge
base and any new submodule commit.

### Severity classification

Severity is what the user loses on a reachable path, not which checklist
found it; Step 3c turns it into Blocking or Deferred. Never classify up "to be
safe". **The user** is an analyst or operator running queries, building
notebooks or letting an agent work, not the team, CI or release process.

**Critical** only if "Because of this, the user sees ___" completes with:

- **wrong or misleading data:** wrong values, columns or types, stale shown as
  fresh, precision or zone corruption, partial shown as complete, failed shown
  as empty, in grid, chart, schema tree or cell; a click writing the wrong
  value into a variable or filter;
- **lost or corrupted persisted state:** buffers, notebooks, saved queries or
  settings destroyed, dropped or rewritten by a migration, save or import;
- **a write the user did not run:** SQL or DDL without action or permission;
- **a broken flow:** blank or crashed console, hang, infinite spinner,
  unusable editor, a query that cannot run or stop;
- **a security failure:** XSS, token or secret leak, open redirect,
  permission bypass, an agent seeing withheld data;
- **a silent failure:** failure with no or the wrong error, looking like
  success;
- **a compatibility break:** earlier-version data no longer loads, an export
  old versions cannot import, a schema or protocol released MCP servers cannot
  use;
- **a perceptible performance regression** (magnitude rule);
- **an admitted Critical coverage gap** (Step 2.6): "user does X; if this
  regressed as Y, the user would see Z";
- **a failing quality gate** (Step 3b).

Every completion names its trigger, "user does X → sees Y". A behavioral
candidate with no evidenced trigger is omitted, not kept as Moderate; static
standards, maintainability and coverage findings fully established from
changed source may still be Moderate or Minor.

**Moderate:** bounded or developer-facing: a changed-line standards
violation, a proved weak test, a Moderate gap, a bounded off-path cost, the
static skeleton of an unexecutable runtime claim. An unreachable runtime
theory is omitted.

**Minor:** naming, formatting, comment wording.

**UX (Agent 18):** **Critical** for a wrong conclusion or lost work
(misleading data, partial or stale shown as complete or current, failure
looking like success, an action with no visible result, a lost edit, a dead
end; the data, broken-flow and silent-failure symptoms above); **Moderate**
when the task works but costs clearly more (an extra main-path step, a
feature promoted where users will not meet it, noise that interrupts or
clutters every use, an error naming no next step, a new pattern where one
exists, an inconsistent term, indistinguishable states); **Minor** for wording, alignment, spacing.

**Magnitude rule.** Performance blocks only when users feel it: the cost
scales with data (rows, cells, chart points, schema items, notebook cells) on
a path users wait for or repeat (render, scroll, keystroke, poll, submit).

- **Critical:** per-row or per-cell work on render or scroll; O(n²) in rows or
  cells; a re-render or refetch storm per keystroke or poll; an interaction
  measured unusable on rung 6. State the multiplier ("a `Map` rebuilt per
  rendered cell").
- **Moderate:** bounded off the hot path (by column count, a fixed enum, once
  per mount or submit). Sub-optimal but bounded is Moderate; name the bound.

**Hostile-input rule.** Untrusted sources: imported files (notebook and tab
JSON, CSV); agent-written content (MCP and AI tool arguments, ECharts options,
markdown); URL parameters (deep links, MCP pairing); database content shown
in the UI (names, values, error texts).

- Security consequences are classified as usual, whoever triggers them.
- A failure only crafted imports or crafted agent input reach, costing only
  availability (blank console, hang, frozen tab) that a reload clears, is no
  finding against this change, even if it introduced it: it is an Adjacent
  draft at the same evidence bar.
- Damage that outlives a reload is classified as usual.
- Legitimate producers include mistakes: an agent sending a wrong type,
  missing a field or writing a documented option, an earlier version's export,
  a hand-edited file, any database value (Unicode, long strings, NULL, huge
  numbers).
- Classify by the easiest trigger; record where you looked for a legitimate
  one.
- When the change claims to harden against a class of input, failures on it
  are classified as usual.

**Out of scope:** merge mechanics (branch, label, merge order, anything true
only while the PR is open); tautologies true of every such change; documented
project decisions (such as best-effort truncation of large snapshots on
rehydrate) and lint or CI rules that pass by design, unless evidence shows
them wrong (a PR-body tradeoff counts only with its measured size, re-measured
by Agent 6); UPSTREAM-SYNC submodule content (Step 2.4); settled items (Step
2.5f).

Do not inflate or deflate; between two readings, pick the one you can
evidence.

### Title and description

The Step 2 result: title, then body and labels, each `OK` or its problems with
the replacement; without a PR, "Skipped: no PR". Not findings: no Step 3b, no
severity, no budget, no verdict effect.

### Blocking

Critical findings rated at or above `--block-at`, and those blocking by rule,
ordered by risk then impact, numbered B1, B2, ... Each has:

- the three summary lines, then **Steps to reproduce**;
- **Risk:** tier, impact, likelihood and the rarest condition with evidence,
  or `blocks by rule: <rule>`;
- **Author's reply** weighed in Step 3c and the evidence answering it;
- the net determination (Step 3b, Net user impact);
- file and line numbers;
- the symptom sentence "user does X → sees Y" (counterfactual for a gap); for
  UX, **Task / Step / Sees / Needs** lines instead: the task, the failing
  step, what the user sees, what they need, with the pattern or data showing
  it;
- for a gap: the mutation, safeguards, change risk, the least fragile stable
  test, and why cheaper ones fail;
- **in-diff** or **out-of-diff-breakage** with the callsite and violated
  contract (2.5c at level 2+, inline at 0-1);
- the path trace; the base behavior for the same trigger, or `N/A — new
  surface` with proof; for performance, the magnitude;
- the fix, to apply in this change.

### Deferred (ship with them)

Critical findings rated below `--block-at`. They never affect the verdict, are
always listed, and nothing is filed. Number D1, D2, ...: **Problem** (≤12
words); **Risk** (tier, impact, likelihood, each condition with tier and
evidence); **Location**; **Steps to reproduce** at `$REV`, and what the
base does with the same steps; **Easiest trigger** if different;
**Suggested fix** (one or two lines); **Found in** (target and revision).

### Moderate

M1, M2, ...: the three lines, **Steps to reproduce** and the decisive
evidence; no dynamic speculation.

### Minor

Concrete cosmetics on changed lines, each with where to look (steps to the
screen); optional.

### Adjacent findings (not blocking — issue drafts)

Proved pre-existing bugs, in code the review visited, that this change does
not introduce, break or worsen, and hostile-input-only failures (even if
introduced here), from the two OMITTED classes with producer, reachability
and observation proved. Number A1, A2, ...; they never touch the verdict and
are never proposed as changes here. Draft fields:

- **Problem** (≤12 words; the issue title); **Net impact** (≤12 words, or
  "None — <reason>"); **Location**;
- **Steps to reproduce** and the symptom, or "latent: no user-visible impact
  today" naming the guard;
- **Origin:** pre-existing, or introduced here (hostile-input only);
- **Reachability**; for hostile input, the input and where you looked for a
  legitimate producer;
- **Suggested fix**; **Severity if filed standalone**.

Provide local drafts only; **never file or post them on GitHub.** Mark
security weaknesses `[security]` and leave reporting to the user. A pre-existing bug this change
moves onto a live path, so that shipping without its fix is unsafe, is
out-of-diff breakage instead: state that argument; Step 3c rates it. Never so
for a hostile-input failure.

### Tests and coverage

Report the test-gate result and whether Vitest coverage was measured.
Publish only admitted coverage gaps, under their severity. Do not list
every uncovered line.

### Summary

- **Verdict**, exactly one:
  - **approve:** no open Blocking finding and the test gate passes; Deferred,
    Moderate and Minor may stay open. Withholding approval then is a review
    failure.
  - **approve with comments:** both gates pass; name the Moderate items to
    address.
  - **request changes:** a Blocking finding is open or the test gate fails.
  - **needs discussion:** a product, architecture or compatibility decision a
    reviewer cannot make alone.
- **Correctness gate:** no "approve" with a missing required agent or gate
  result. A Step 1b gate failure is the early `request changes` exception
  to required fanout. No "approve" with a Blocking finding open; Deferred
  and omitted items never count. First re-run the **admission audit**:
  falsification (strongest disproof per finding); producer (real trigger);
  independence (falsifiers got nothing forbidden, Step 3b); history-free
  discovery (Step 2.5f); dynamic evidence (executed artifact at `$REV` and
  base for race, ordering, persistence, compatibility); dependency; severity
  only after admission; risk checked (Step 3c). A failed field omits the
  candidate; re-run the verdict.
- **Test gate:** a confirmed test failure at the reviewed revision blocks
  (Step 3b). A coverage percentage or zero test changes is not a gate.
- **State:**
  - the test-gate result and the admitted gap count;
  - the regressions and tradeoffs the change makes on purpose;
  - the Step 2.4 verdict when the pointer moved;
  - the admitted in-diff / out-of-diff split. Levels 0-1: say the callsite
    analysis was limited. Levels 2-3: a non-trivial diff with no out-of-diff
    finding is either well contained (say so) or the cross-context pass
    underran: re-check 2.5d first;
  - Blocking findings by risk tier, and the Moderate and Minor counts
    (Deferred are counted in their section). A long or severity-heavy report
    re-runs admission.
- Never make the verdict conditional on splitting the change.
- Remove every worktree (`git worktree remove --force <path>`) and stop the
  browser environment (`review-browser-env.mjs stop`); say so.
