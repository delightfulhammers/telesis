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

	s, err := status.GetStatus(rootDir)
	require.NoError(t, err)

	assert.False(t, s.ContextGeneratedAt.IsZero())
	assert.WithinDuration(t, time.Now(), s.ContextGeneratedAt, 5*time.Second)
}

func TestGetStatusExtractsMilestone(t *testing.T) {
	rootDir := setupProject(t)

	milestones := `# Milestones

## MVP v0.1.0

**Goal:** Build the first version.

**Done when:**

1. Feature A works
2. Feature B works
`
	require.NoError(t, os.WriteFile(
		filepath.Join(rootDir, "docs", "MILESTONES.md"),
		[]byte(milestones),
		0o644,
	))

	s, err := status.GetStatus(rootDir)
	require.NoError(t, err)

	assert.Contains(t, s.ActiveMilestone, "MVP v0.1.0")
	assert.Contains(t, s.ActiveMilestone, "Build the first version")
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
