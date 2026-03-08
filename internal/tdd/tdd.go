package tdd

import (
	"github.com/delightfulhammers/telesis/internal/docgen"
)

const prefix = "TDD"

func config() docgen.Config {
	return docgen.Config{
		Prefix:   prefix,
		Subdir:   "tdd",
		Template: "tdd.md.tmpl",
	}
}

// Create creates a new TDD file with the next sequential number.
// It returns the path to the created file.
func Create(rootDir, slug string) (string, error) {
	return docgen.Create(rootDir, config(), slug)
}

// NextNumber scans the TDD directory and returns the next sequential number.
func NextNumber(tddDir string) (int, error) {
	return docgen.NextNumber(tddDir, prefix)
}
