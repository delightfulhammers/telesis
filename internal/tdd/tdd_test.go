package tdd_test

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/delightfulhammers/telesis/internal/tdd"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTDDDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "docs", "tdd"), 0o755))
	return dir
}

func TestCreateFirstTDD(t *testing.T) {
	rootDir := setupTDDDir(t)

	path, err := tdd.Create(rootDir, "config-loader")
	require.NoError(t, err)

	assert.Equal(t, filepath.Join(rootDir, "docs", "tdd", "TDD-001-config-loader.md"), path)
	assert.FileExists(t, path)

	content, err := os.ReadFile(path)
	require.NoError(t, err)
	assert.Contains(t, string(content), "# TDD-001: config-loader")
	assert.Contains(t, string(content), "## Overview")
	assert.Contains(t, string(content), "## Components")
	assert.Contains(t, string(content), "## Interfaces")
	assert.Contains(t, string(content), "## Data Model")
	assert.Contains(t, string(content), "## Open Questions")
}

func TestCreateSequentialTDDs(t *testing.T) {
	rootDir := setupTDDDir(t)

	path1, err := tdd.Create(rootDir, "first")
	require.NoError(t, err)
	assert.Contains(t, path1, "TDD-001-first.md")

	path2, err := tdd.Create(rootDir, "second")
	require.NoError(t, err)
	assert.Contains(t, path2, "TDD-002-second.md")
}

func TestCreateTDDWithExistingGap(t *testing.T) {
	rootDir := setupTDDDir(t)
	tddDir := filepath.Join(rootDir, "docs", "tdd")

	require.NoError(t, os.WriteFile(
		filepath.Join(tddDir, "TDD-010-existing.md"),
		[]byte("# TDD-010: existing\n"),
		0o644,
	))

	path, err := tdd.Create(rootDir, "next")
	require.NoError(t, err)
	assert.Contains(t, path, "TDD-011-next.md")
}

func TestCreateTDDRejectsEmptySlug(t *testing.T) {
	rootDir := setupTDDDir(t)

	_, err := tdd.Create(rootDir, "")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "slug")
}

func TestCreateTDDRejectsInvalidSlug(t *testing.T) {
	tests := []struct {
		name string
		slug string
	}{
		{"spaces", "has spaces"},
		{"uppercase", "HasUpperCase"},
		{"special chars", "has/slashes"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rootDir := setupTDDDir(t)
			_, err := tdd.Create(rootDir, tt.slug)
			assert.Error(t, err)
			assert.Contains(t, err.Error(), "slug")
		})
	}
}

func TestNextNumberEmptyDir(t *testing.T) {
	rootDir := setupTDDDir(t)

	num, err := tdd.NextNumber(filepath.Join(rootDir, "docs", "tdd"))
	require.NoError(t, err)
	assert.Equal(t, 1, num)
}

func TestNextNumberWithExisting(t *testing.T) {
	rootDir := setupTDDDir(t)
	tddDir := filepath.Join(rootDir, "docs", "tdd")

	for i := 1; i <= 3; i++ {
		require.NoError(t, os.WriteFile(
			filepath.Join(tddDir, fmt.Sprintf("TDD-%03d-test.md", i)),
			[]byte(fmt.Sprintf("# TDD-%03d: test\n", i)),
			0o644,
		))
	}

	num, err := tdd.NextNumber(tddDir)
	require.NoError(t, err)
	assert.Equal(t, 4, num)
}

func TestNextNumberIgnoresNonTDDFiles(t *testing.T) {
	rootDir := setupTDDDir(t)
	tddDir := filepath.Join(rootDir, "docs", "tdd")

	require.NoError(t, os.WriteFile(
		filepath.Join(tddDir, "README.md"),
		[]byte("# TDDs\n"),
		0o644,
	))

	num, err := tdd.NextNumber(tddDir)
	require.NoError(t, err)
	assert.Equal(t, 1, num)
}
