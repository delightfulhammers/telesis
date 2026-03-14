---
title: GitHub Integration
description: PR comments, issue management, and dismissal sync
weight: 310
---

# GitHub Integration

Telesis integrates with GitHub for work intake, PR-level code review, and issue lifecycle management. All GitHub features require `GITHUB_TOKEN` to be set.

## Work Intake from GitHub

Import open issues as work items:

```bash
telesis intake github
```

This fetches issues from the repository configured in `.telesis/config.yml` (`project.repo`). Telesis deduplicates against existing work items, so repeated imports are safe.

Filter what gets imported:

```yaml
intake:
  github:
    labels: ["bug", "feature"]
    excludeLabels: ["wontfix"]
    assignee: "your-username"
    state: "open"
```

## PR Code Review Comments

Post review findings as inline PR comments:

```bash
telesis review --github-pr
```

This posts each finding as a line-level comment on the current PR. Comments include the severity, category, description, and suggestion. Finding IDs are embedded as HTML comment markers for correlation with local data.

The posting is idempotent — running it multiple times won't create duplicate comments. Telesis checks for existing comments with matching finding ID markers.

## Drift as PR Comments

Post drift findings to a PR:

```bash
telesis drift --github-pr
```

Like review comments, this is idempotent.

## Dismissal Sync

Telesis bridges the gap between local review triage and GitHub PR conversations.

### Importing Dismissals from GitHub

```bash
telesis review sync-dismissals --pr 42
```

This reads the PR's review threads and imports dismissal signals. When a reviewer resolves a thread, replies with an acknowledgment, or otherwise indicates a finding has been addressed, Telesis converts that into a local dismissal.

The matching uses fuzzy similarity — finding IDs embedded in comments provide exact correlation, and for comments without markers, Telesis uses word-bag similarity to match GitHub thread context to local findings.

### Posting Dismissal Replies to GitHub

```bash
telesis review sync-replies --pr 42
```

When you dismiss findings locally (`telesis review dismiss`), this command posts replies to the corresponding GitHub PR threads, letting other reviewers know the finding has been triaged. Only unsynced dismissals are posted — it's safe to run repeatedly.

## PR Creation

When using the full pipeline (`telesis run`), Telesis can create a PR automatically:

```yaml
git:
  createPR: true
```

The PR is created after pushing the branch. The title and description are generated from the work item and plan.

## Issue Closure

When using the full pipeline, Telesis can close the source GitHub issue:

```yaml
pipeline:
  closeIssue: true
```

The issue is closed with a comment linking to the created PR.

## GitHub Token Scopes

The `GITHUB_TOKEN` needs these scopes:

- `repo` — for reading issues, creating PRs, posting comments
- `workflow` — only if your repository uses GitHub Actions and you need to push workflow files (note: this requires SSH remotes, not HTTPS)

## The Review-PR Workflow

A typical workflow combining local review with GitHub PR conversations:

```bash
# Create a branch and make changes
git checkout -b feature/new-thing

# Review locally
telesis review --ref main...HEAD

# Dismiss false positives locally
telesis review dismiss abc123 --reason false-positive

# Push and create PR
git push -u origin feature/new-thing
gh pr create

# Post review findings to PR
telesis review --github-pr

# Post dismissal replies
telesis review sync-replies --pr 42

# After teammates review, import their dismissals
telesis review sync-dismissals --pr 42

# Run another round — dismissed findings are filtered
telesis review --ref main...HEAD
```
