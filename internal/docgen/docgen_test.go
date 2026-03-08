package docgen_test

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/delightfulhammers/telesis/internal/docgen"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var adrConfig = docgen.Config{
	Prefix:   "ADR",
	Subdir:   "adr",
	Template: "adr.md.tmpl",
}

func setupDocDir(t *testing.T, subdir string) string {
	t.Helper()
	dir := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "docs", subdir), 0o755))
	return dir
}

func TestCreateFirstDocument(t *testing.T) {
	rootDir := setupDocDir(t, "adr")

	path, err := docgen.Create(rootDir, adrConfig, "use-cobra")
	require.NoError(t, err)

	assert.Equal(t, filepath.Join(rootDir, "docs", "adr", "ADR-001-use-cobra.md"), path)
	assert.FileExists(t, path)

	content, err := os.ReadFile(path)
	require.NoError(t, err)
	assert.Contains(t, string(content), "# ADR-001: use-cobra")
}

func TestCreateSequentialDocuments(t *testing.T) {
	rootDir := setupDocDir(t, "adr")

	path1, err := docgen.Create(rootDir, adrConfig, "first")
	require.NoError(t, err)
	assert.Contains(t, path1, "ADR-001-first.md")

	path2, err := docgen.Create(rootDir, adrConfig, "second")
	require.NoError(t, err)
	assert.Contains(t, path2, "ADR-002-second.md")
}

func TestCreateWithExistingGap(t *testing.T) {
	rootDir := setupDocDir(t, "adr")
	adrDir := filepath.Join(rootDir, "docs", "adr")

	require.NoError(t, os.WriteFile(
		filepath.Join(adrDir, "ADR-005-existing.md"),
		[]byte("# ADR-005: existing\n"),
		0o644,
	))

	path, err := docgen.Create(rootDir, adrConfig, "next")
	require.NoError(t, err)
	assert.Contains(t, path, "ADR-006-next.md")
}

func TestCreateHandlesCollision(t *testing.T) {
	rootDir := setupDocDir(t, "adr")
	adrDir := filepath.Join(rootDir, "docs", "adr")

	// Pre-create the file that would be ADR-001
	require.NoError(t, os.WriteFile(
		filepath.Join(adrDir, "ADR-001-existing.md"),
		[]byte("# ADR-001: existing\n"),
		0o644,
	))

	// Creating with a different slug should get ADR-002
	path, err := docgen.Create(rootDir, adrConfig, "new-one")
	require.NoError(t, err)
	assert.Contains(t, path, "ADR-002-new-one.md")
}

func TestValidateSlug(t *testing.T) {
	tests := []struct {
		name    string
		slug    string
		wantErr bool
	}{
		{"valid simple", "use-cobra", false},
		{"valid single word", "cobra", false},
		{"valid with numbers", "v2-migration", false},
		{"empty", "", true},
		{"spaces", "has spaces", true},
		{"uppercase", "HasUpperCase", true},
		{"slashes", "has/slashes", true},
		{"dots", "has.dots", true},
		{"leading hyphen", "-leading", true},
		{"trailing hyphen", "trailing-", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := docgen.ValidateSlug(tt.slug)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestNextNumberEmptyDir(t *testing.T) {
	rootDir := setupDocDir(t, "adr")

	num, err := docgen.NextNumber(filepath.Join(rootDir, "docs", "adr"), "ADR")
	require.NoError(t, err)
	assert.Equal(t, 1, num)
}

func TestNextNumberWithExisting(t *testing.T) {
	rootDir := setupDocDir(t, "adr")
	adrDir := filepath.Join(rootDir, "docs", "adr")

	for i := 1; i <= 3; i++ {
		require.NoError(t, os.WriteFile(
			filepath.Join(adrDir, fmt.Sprintf("ADR-%03d-test.md", i)),
			[]byte(fmt.Sprintf("# ADR-%03d: test\n", i)),
			0o644,
		))
	}

	num, err := docgen.NextNumber(adrDir, "ADR")
	require.NoError(t, err)
	assert.Equal(t, 4, num)
}

func TestNextNumberIgnoresNonMatchingFiles(t *testing.T) {
	rootDir := setupDocDir(t, "adr")
	adrDir := filepath.Join(rootDir, "docs", "adr")

	require.NoError(t, os.WriteFile(
		filepath.Join(adrDir, "README.md"),
		[]byte("# ADRs\n"),
		0o644,
	))

	num, err := docgen.NextNumber(adrDir, "ADR")
	require.NoError(t, err)
	assert.Equal(t, 1, num)
}

func TestCreateMissingDirectory(t *testing.T) {
	rootDir := t.TempDir()

	_, err := docgen.Create(rootDir, adrConfig, "something")
	assert.Error(t, err)
}
