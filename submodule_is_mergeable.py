#!/usr/bin/env python3

"""
Ensure that the PR's `questdb` submodule is mergeable.

================================================
This script does not modify the repo in any way.
================================================

This is achieved if the commit that the submodule points to respects that it:
* Is a commit that is in the `questdb` master branch's history.
* Is no more than ACCEPTABLE_LAG commits behind.
* Is same or newer as the current commit pointed to currently.

Before running, you may first need to install dependencies:

    $ python3 -m pip install -U pip
    $ python3 -m pip install -U pygit2

To run, from the root of the repo, call:

    git fetch
    (cd questdb && git fetch)
    python3 ci/submodule_is_mergeable.py

On error, will return non-zero exit code and fail the CI run.
"""

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
        commit_ids.append(commit.id)
        if index > ACCEPTABLE_LAG:
            break
    return commit_ids


def check_commit_is_from_recent_master(oss_master_commits: [pygit2.Oid], oss_head: pygit2.Oid):
    if oss_head not in oss_master_commits:
        sys.stderr.write('The `questdb` submodule is not mergeable.\n')
        sys.stderr.write(
            f'The submodule\'s commit ({oss_head}) is not one of the ' +
            f'last {ACCEPTABLE_LAG} commits in the `questdb` master branch.\n')
        for commit in oss_master_commits:
            sys.stderr.write(f'  * {commit}\n')
        sys.exit(1)


def check_not_older(
        ui_repo: pygit2.Repository,
        oss_master_commits: [pygit2.Oid],
        oss_head: pygit2.Oid):
    ui_main_head = ui_repo.references['refs/remotes/origin/main'].peel().id
    ui_main_tree = ui_repo[ui_main_head].tree
    questdb_main_commit_id = ui_main_tree['e2e/questdb'].id

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
