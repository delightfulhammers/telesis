package adr

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
	numberRe      = regexp.MustCompile(`^ADR-(\d+)`)
	slugRe        = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	adrTemplates  *template.Template
	adrParseOnce  sync.Once
	adrParseError error
)

type templateData struct {
	Number int
	Slug   string
	Padded string
}

func loadTemplates() (*template.Template, error) {
	adrParseOnce.Do(func() {
		adrTemplates, adrParseError = template.ParseFS(templates.FS, "*.tmpl")
	})
	return adrTemplates, adrParseError
}

// Create creates a new ADR file with the next sequential number.
// It returns the path to the created file.
func Create(rootDir, slug string) (string, error) {
	if err := validateSlug(slug); err != nil {
		return "", err
	}

	adrDir := filepath.Join(rootDir, "docs", "adr")

	num, err := NextNumber(adrDir)
	if err != nil {
		return "", fmt.Errorf("determining next ADR number: %w", err)
	}

	content, err := renderADR(num, slug)
	if err != nil {
		return "", err
	}

	filename := fmt.Sprintf("ADR-%03d-%s.md", num, slug)
	dest := filepath.Join(adrDir, filename)

	if err := os.WriteFile(dest, content, 0o666); err != nil {
		return "", fmt.Errorf("writing %s: %w", filename, err)
	}

	return dest, nil
}

// NextNumber scans the ADR directory and returns the next sequential number.
func NextNumber(adrDir string) (int, error) {
	entries, err := os.ReadDir(adrDir)
	if err != nil {
		return 0, fmt.Errorf("reading ADR directory: %w", err)
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
		return fmt.Errorf("slug must be lowercase alphanumeric with hyphens (e.g., 'use-nats-for-events')")
	}
	return nil
}

func renderADR(num int, slug string) ([]byte, error) {
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
	if err := tmpls.ExecuteTemplate(&buf, "adr.md.tmpl", data); err != nil {
		return nil, fmt.Errorf("rendering ADR template: %w", err)
	}

	return buf.Bytes(), nil
}
