---
name: telesis-upgrade
description: "Use when a Telesis-managed project may be missing scaffold artifacts (skills, hooks, MCP config) because it was initialized with an older version of Telesis. Detect this when: .claude/skills/ is empty or missing, .claude/settings.json is missing, .mcp.json is missing, or the user mentions their telesis setup seems incomplete."
---

# Telesis Upgrade — Retrofit Missing Scaffold Artifacts

The project may be missing scaffold artifacts added in newer versions of Telesis. This is normal for projects initialized before certain features were added.

## Check for missing artifacts

```bash
telesis upgrade --check
```

This reports what would be added without making changes.

## Apply the upgrade

```bash
telesis upgrade
```

This creates any missing artifacts. It **never overwrites** existing files — only adds what's missing.

## What gets added

Depending on when the project was initialized, these may be missing:

| Artifact | Added in | Purpose |
|----------|----------|---------|
| `.claude/settings.json` | v0.23.0 | Claude Code hook configuration |
| `.claude/hooks/git-preflight.sh` | v0.23.0 | Pre-commit preflight checks |
| `.mcp.json` | v0.27.1 | MCP server configuration |
| `.claude/skills/telesis-*/SKILL.md` | v0.27.4 | Contextual usage skills |
| `docs/context/` | v0.1.0 | CLAUDE.md context sections |

## When to suggest upgrading

- Project has `.telesis/config.yml` but no `.claude/skills/` directory
- Project has `.telesis/config.yml` but no `.mcp.json`
- Project has `.telesis/config.yml` but no `.claude/settings.json`
- User reports that telesis features seem missing or not working
