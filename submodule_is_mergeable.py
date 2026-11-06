#!/usr/bin/env python3

"""
Ensure that the PR's `questdb` submodule is mergeable.

================================================
This script does not modify the repo in any way.
================================================

This is achieved if the commit that the submodule points to respects that it:
* Is a commit that is in the `questdb` master branch's history.
* Is no more than ACCEPTABLE_LAG commits behind.

(A third rule, "same or newer than the commit `main` points to", lives in
`check_not_older` but is currently disabled in `main()`.)

To run, from the root of the repo, call:

    git -C test/e2e/questdb fetch origin master
    uv run --python 3.12 --with "pygit2==1.14.1" submodule_is_mergeable.py

This is the same command CI uses (see
.github/workflows/check_oss_submodule.yml). If the check fails, run
`yarn sync:questdb` and commit the updated `test/e2e/questdb` pointer.

On error, will return non-zero exit code and fail the CI run.
"""

import configparser
import sys
sys.dont_write_bytecode = True
import pygit2


# Number of commits that the submodule can be behind the OSS master branch
# If it's older than this, it really ought to be updated.
ACCEPTABLE_LAG = 5


def get_last_master_commits(questdb_repo: pygit2.Repository) -> [pygit2.Oid]:
    commit_ids = []
    oss_master_ref = questdb_repo.references['refs/remotes/origin/master']
    origin_master_head: pygit2.Oid = oss_master_ref.peel().id
    for index, commit in enumerate(questdb_repo.walk(origin_master_head)):
        # print(f'{commit.id}\t{commit.message}')
        if index > ACCEPTABLE_LAG:
            break
        commit_ids.append(commit.id)
    return commit_ids


def check_commit_is_from_recent_master(oss_master_commits: [pygit2.Oid], oss_head: pygit2.Oid):
    if oss_head not in oss_master_commits:
        sys.stderr.write('The `questdb` submodule is not mergeable.\n')
        sys.stderr.write(
            f'The submodule\'s commit ({oss_head}) is not one of the ' +
            f'last {len(oss_master_commits)} commits in the `questdb` master ' +
            f'branch (at most {ACCEPTABLE_LAG} commits behind its head).\n')
        for commit in oss_master_commits:
            sys.stderr.write(f'  * {commit}\n')
        sys.stderr.write(
            'Run `yarn sync:questdb` and commit the updated `test/e2e/questdb` ' +
            'pointer.\n')
        sys.exit(1)


def check_not_older(
        ui_repo: pygit2.Repository,
        oss_master_commits: [pygit2.Oid],
        oss_head: pygit2.Oid):
    ui_main_head = ui_repo.references['refs/remotes/origin/main'].peel().id
    ui_main_tree = ui_repo[ui_main_head].tree
    modules = configparser.ConfigParser()
    modules.read_string(ui_repo[ui_main_tree['.gitmodules'].id].data.decode())
    questdb_path = modules['submodule "questdb"']['path']
    questdb_main_commit_id = ui_main_tree[questdb_path].id

    if questdb_main_commit_id not in oss_master_commits:
        sys.stderr.write(
            'The submodule pointed to by `main` is not in the ' +
            f'last {ACCEPTABLE_LAG} commits from the `questdb` master branch.\n')
        return

    old_index = oss_master_commits.index(questdb_main_commit_id)
    new_index = oss_master_commits.index(oss_head)
    if new_index > old_index:
        sys.stderr.write('The `questdb` submodule is not mergeable.\n')
        sys.stderr.write(
            f'This branch\'s `questdb` submodule\'s commit is older than ' +
            f'the commit pointed to by the `main` branch.\n')
        sys.stderr.write(
            f'  * This branch points to: {oss_head}\n' +
            f'  * The `main` branch to:  {questdb_main_commit_id}\n')
        sys.exit(1)


def main():
    # Open the ui and questdb submodule repositories.
    ui_repo = pygit2.Repository('.git')
    questdb_repo: pygit2.Repository = ui_repo.lookup_submodule('questdb').open()

    # The current commit id pointed to by the submodule in this branch.
    oss_head: pygit2.Oid = questdb_repo.head.target

    # The last few commits in the `questdb` origin/master branch.
    oss_master_commits = get_last_master_commits(questdb_repo)

    # Check that the submodule's commit is from that list.
    check_commit_is_from_recent_master(oss_master_commits, oss_head)

    # Check that the submodule's commit is not older than the current commit
    # from the `main` branch of the ui repo.
    # check_not_older(ui_repo, oss_master_commits, oss_head)


if __name__ == '__main__':
    main()
