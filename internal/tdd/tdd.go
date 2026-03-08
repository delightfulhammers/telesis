package tdd

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"sync"
	"text/template"

	"github.com/delightfulhammers/telesis/templates"
)

var (
	numberRe      = regexp.MustCompile(`^TDD-(\d+)`)
	slugRe        = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	tddTemplates  *template.Template
	tddParseOnce  sync.Once
	tddParseError error
)

type templateData struct {
	Number int
	Slug   string
	Padded string
}

func loadTemplates() (*template.Template, error) {
	tddParseOnce.Do(func() {
		tddTemplates, tddParseError = template.ParseFS(templates.FS, "*.tmpl")
	})
	return tddTemplates, tddParseError
}

// Create creates a new TDD file with the next sequential number.
// It returns the path to the created file.
func Create(rootDir, slug string) (string, error) {
	if err := validateSlug(slug); err != nil {
		return "", err
	}

	tddDir := filepath.Join(rootDir, "docs", "tdd")

	num, err := NextNumber(tddDir)
	if err != nil {
		return "", fmt.Errorf("determining next TDD number: %w", err)
	}

	content, err := renderTDD(num, slug)
	if err != nil {
		return "", err
	}

	filename := fmt.Sprintf("TDD-%03d-%s.md", num, slug)
	dest := filepath.Join(tddDir, filename)

	if err := os.WriteFile(dest, content, 0o666); err != nil {
		return "", fmt.Errorf("writing %s: %w", filename, err)
	}

	return dest, nil
}

// NextNumber scans the TDD directory and returns the next sequential number.
func NextNumber(tddDir string) (int, error) {
	entries, err := os.ReadDir(tddDir)
	if err != nil {
		return 0, fmt.Errorf("reading TDD directory: %w", err)
	}

	highest := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if m := numberRe.FindStringSubmatch(entry.Name()); len(m) > 1 {
			n, _ := strconv.Atoi(m[1])
			if n > highest {
				highest = n
			}
		}
	}

	return highest + 1, nil
}

func validateSlug(slug string) error {
	if slug == "" {
		return fmt.Errorf("slug is required")
	}
	if !slugRe.MatchString(slug) {
		return fmt.Errorf("slug must be lowercase alphanumeric with hyphens (e.g., 'config-loader')")
	}
	return nil
}

func renderTDD(num int, slug string) ([]byte, error) {
	tmpls, err := loadTemplates()
	if err != nil {
		return nil, fmt.Errorf("loading templates: %w", err)
	}

	data := templateData{
		Number: num,
		Slug:   slug,
		Padded: fmt.Sprintf("%03d", num),
	}

	var buf bytes.Buffer
	if err := tmpls.ExecuteTemplate(&buf, "tdd.md.tmpl", data); err != nil {
		return nil, fmt.Errorf("rendering TDD template: %w", err)
	}

	return buf.Bytes(), nil
}
