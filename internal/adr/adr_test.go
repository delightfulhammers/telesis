package adr_test

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/delightfulhammers/telesis/internal/adr"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupADRDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "docs", "adr"), 0o755))
	return dir
}

func TestCreateFirstADR(t *testing.T) {
	rootDir := setupADRDir(t)

	path, err := adr.Create(rootDir, "use-cobra")
	require.NoError(t, err)

	assert.Equal(t, filepath.Join(rootDir, "docs", "adr", "ADR-001-use-cobra.md"), path)
	assert.FileExists(t, path)

	content, err := os.ReadFile(path)
	require.NoError(t, err)
	assert.Contains(t, string(content), "# ADR-001: use-cobra")
	assert.Contains(t, string(content), "## Status")
	assert.Contains(t, string(content), "Proposed")
	assert.Contains(t, string(content), "## Context")
	assert.Contains(t, string(content), "## Decision")
	assert.Contains(t, string(content), "## Consequences")
}

func TestCreateSequentialADRs(t *testing.T) {
	rootDir := setupADRDir(t)

	path1, err := adr.Create(rootDir, "first")
	require.NoError(t, err)
	assert.Contains(t, path1, "ADR-001-first.md")

	path2, err := adr.Create(rootDir, "second")
	require.NoError(t, err)
	assert.Contains(t, path2, "ADR-002-second.md")

	path3, err := adr.Create(rootDir, "third")
	require.NoError(t, err)
	assert.Contains(t, path3, "ADR-003-third.md")
}

func TestCreateADRWithExistingGap(t *testing.T) {
	rootDir := setupADRDir(t)
	adrDir := filepath.Join(rootDir, "docs", "adr")

	// Create ADR-005 directly (simulating a gap)
	require.NoError(t, os.WriteFile(
		filepath.Join(adrDir, "ADR-005-existing.md"),
		[]byte("# ADR-005: existing\n"),
		0o644,
	))

	path, err := adr.Create(rootDir, "next")
	require.NoError(t, err)
	assert.Contains(t, path, "ADR-006-next.md")
}

func TestCreateADRRejectsEmptySlug(t *testing.T) {
	rootDir := setupADRDir(t)

	_, err := adr.Create(rootDir, "")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "slug")
}

func TestCreateADRRejectsInvalidSlug(t *testing.T) {
	tests := []struct {
		name string
		slug string
	}{
		{"spaces", "has spaces"},
		{"uppercase", "HasUpperCase"},
		{"special chars", "has/slashes"},
		{"dots", "has.dots"},
		{"starts with hyphen", "-leading"},
		{"ends with hyphen", "trailing-"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rootDir := setupADRDir(t)
			_, err := adr.Create(rootDir, tt.slug)
			assert.Error(t, err)
			assert.Contains(t, err.Error(), "slug")
		})
	}
}

func TestCreateADRMissingDirectory(t *testing.T) {
	rootDir := t.TempDir()
	// No docs/adr/ directory

	_, err := adr.Create(rootDir, "something")
	assert.Error(t, err)
}

func TestNextNumberEmptyDir(t *testing.T) {
	rootDir := setupADRDir(t)

	num, err := adr.NextNumber(filepath.Join(rootDir, "docs", "adr"))
	require.NoError(t, err)
	assert.Equal(t, 1, num)
}

func TestNextNumberWithExisting(t *testing.T) {
	rootDir := setupADRDir(t)
	adrDir := filepath.Join(rootDir, "docs", "adr")

	for i := 1; i <= 3; i++ {
		require.NoError(t, os.WriteFile(
			filepath.Join(adrDir, fmt.Sprintf("ADR-%03d-test.md", i)),
			[]byte(fmt.Sprintf("# ADR-%03d: test\n", i)),
			0o644,
		))
	}

	num, err := adr.NextNumber(adrDir)
	require.NoError(t, err)
	assert.Equal(t, 4, num)
}

func TestNextNumberIgnoresNonADRFiles(t *testing.T) {
	rootDir := setupADRDir(t)
	adrDir := filepath.Join(rootDir, "docs", "adr")

	require.NoError(t, os.WriteFile(
		filepath.Join(adrDir, "README.md"),
		[]byte("# ADRs\n"),
		0o644,
	))

	num, err := adr.NextNumber(adrDir)
	require.NoError(t, err)
	assert.Equal(t, 1, num)
}
