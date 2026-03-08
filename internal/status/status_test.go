package status_test

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/delightfulhammers/telesis/internal/config"
	"github.com/delightfulhammers/telesis/internal/status"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupProject(t *testing.T) string {
	t.Helper()
	rootDir := t.TempDir()

	cfg := &config.Config{
		Project: config.Project{
			Name:     "TestProject",
			Owner:    "Test Owner",
			Language: "Go",
			Status:   "active",
		},
	}
	require.NoError(t, config.Save(rootDir, cfg))
	require.NoError(t, os.MkdirAll(filepath.Join(rootDir, "docs", "adr"), 0o755))
	require.NoError(t, os.MkdirAll(filepath.Join(rootDir, "docs", "tdd"), 0o755))

	return rootDir
}

func TestGetStatusBasic(t *testing.T) {
	rootDir := setupProject(t)

	s, err := status.GetStatus(rootDir)
	require.NoError(t, err)

	assert.Equal(t, "TestProject", s.ProjectName)
	assert.Equal(t, "active", s.ProjectStatus)
	assert.Equal(t, 0, s.ADRCount)
	assert.Equal(t, 0, s.TDDCount)
	assert.True(t, s.ContextGeneratedAt.IsZero())
}

func TestGetStatusCountsADRs(t *testing.T) {
	rootDir := setupProject(t)
	adrDir := filepath.Join(rootDir, "docs", "adr")

	for i := 1; i <= 3; i++ {
		require.NoError(t, os.WriteFile(
			filepath.Join(adrDir, fmt.Sprintf("ADR-%03d-test.md", i)),
			[]byte(fmt.Sprintf("# ADR-%03d: test\n", i)),
			0o644,
		))
	}
	// Non-ADR file should be ignored
	require.NoError(t, os.WriteFile(
		filepath.Join(adrDir, "README.md"),
		[]byte("# ADRs\n"),
		0o644,
	))

	s, err := status.GetStatus(rootDir)
	require.NoError(t, err)
	assert.Equal(t, 3, s.ADRCount)
}

func TestGetStatusCountsTDDs(t *testing.T) {
	rootDir := setupProject(t)
	tddDir := filepath.Join(rootDir, "docs", "tdd")

	for i := 1; i <= 2; i++ {
		require.NoError(t, os.WriteFile(
			filepath.Join(tddDir, fmt.Sprintf("TDD-%03d-test.md", i)),
			[]byte(fmt.Sprintf("# TDD-%03d: test\n", i)),
			0o644,
		))
	}

	s, err := status.GetStatus(rootDir)
	require.NoError(t, err)
	assert.Equal(t, 2, s.TDDCount)
}

func TestGetStatusReadsContextTimestamp(t *testing.T) {
	rootDir := setupProject(t)

	claudePath := filepath.Join(rootDir, "CLAUDE.md")
	require.NoError(t, os.WriteFile(claudePath, []byte("# Test\n"), 0o644))

	knownTime := time.Date(2026, 1, 15, 10, 30, 0, 0, time.UTC)
	require.NoError(t, os.Chtimes(claudePath, knownTime, knownTime))

	s, err := status.GetStatus(rootDir)
	require.NoError(t, err)

	assert.True(t, knownTime.Equal(s.ContextGeneratedAt),
		"expected %v, got %v", knownTime, s.ContextGeneratedAt)
}

func TestGetStatusExtractsMilestone(t *testing.T) {
	tests := []struct {
		name        string
		content     string
		wantContain string
		wantExclude string
	}{
		{
			name: "basic extraction",
			content: `# Milestones

## MVP v0.1.0

**Goal:** Build the first version.

1. Feature A works
`,
			wantContain: "Build the first version",
		},
		{
			name: "stops at next heading",
			content: `# Milestones

## MVP v0.1.0

MVP content here.

## Future Work

This should not appear.
`,
			wantContain: "MVP content here",
			wantExclude: "should not appear",
		},
		{
			name: "stops at separator",
			content: `# Milestones

## MVP v0.1.0

MVP content here.

---

Other section.
`,
			wantContain: "MVP content here",
			wantExclude: "Other section",
		},
		{
			name: "no matching header",
			content: `# Milestones

## Phase 1

Not an MVP heading.
`,
			wantContain: "",
		},
		{
			name: "handles whitespace around separator",
			content: `# Milestones

## MVP v0.1.0

MVP content.

  ---

After separator.
`,
			wantContain: "MVP content",
			wantExclude: "After separator",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rootDir := setupProject(t)
			require.NoError(t, os.WriteFile(
				filepath.Join(rootDir, "docs", "MILESTONES.md"),
				[]byte(tt.content),
				0o644,
			))

			s, err := status.GetStatus(rootDir)
			require.NoError(t, err)

			if tt.wantContain != "" {
				assert.Contains(t, s.ActiveMilestone, tt.wantContain)
			} else {
				assert.Empty(t, s.ActiveMilestone)
			}
			if tt.wantExclude != "" {
				assert.NotContains(t, s.ActiveMilestone, tt.wantExclude)
			}
		})
	}
}

func TestGetStatusMissingOptionalFiles(t *testing.T) {
	rootDir := setupProject(t)
	// No MILESTONES.md, no CLAUDE.md, no ADRs, no TDDs

	s, err := status.GetStatus(rootDir)
	require.NoError(t, err)

	assert.Equal(t, "", s.ActiveMilestone)
	assert.True(t, s.ContextGeneratedAt.IsZero())
	assert.Equal(t, 0, s.ADRCount)
	assert.Equal(t, 0, s.TDDCount)
}

func TestGetStatusFailsWithoutConfig(t *testing.T) {
	rootDir := t.TempDir()

	_, err := status.GetStatus(rootDir)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "telesis init")
}
