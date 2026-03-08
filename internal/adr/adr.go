package adr

import (
	"github.com/delightfulhammers/telesis/internal/docgen"
)

var cfg = docgen.Config{
	Prefix:   "ADR",
	Subdir:   "adr",
	Template: "adr.md.tmpl",
}

// Create creates a new ADR file with the next sequential number.
// It returns the path to the created file.
func Create(rootDir, slug string) (string, error) {
	return docgen.Create(rootDir, cfg, slug)
}

// NextNumber scans the ADR directory and returns the next sequential number.
func NextNumber(adrDir string) (int, error) {
	return docgen.NextNumber(adrDir, cfg.Prefix)
}
