package docgen

import (
	"bytes"
	"errors"
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
	slugRe          = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	parsedTemplates *template.Template
	parseOnce       sync.Once
	parseError      error
)

func loadTemplates() (*template.Template, error) {
	parseOnce.Do(func() {
		parsedTemplates, parseError = template.ParseFS(templates.FS, "*.tmpl")
	})
	return parsedTemplates, parseError
}

// Config describes a numbered document type (ADR, TDD, etc.).
type Config struct {
	Prefix   string // e.g., "ADR" or "TDD"
	Subdir   string // e.g., "adr" or "tdd"
	Template string // e.g., "adr.md.tmpl"
}

// TemplateData is passed to the document template.
type TemplateData struct {
	Number int
	Slug   string
	Padded string
}

// Create creates a new numbered document with collision-safe file creation.
// It returns the path to the created file.
func Create(rootDir string, cfg Config, slug string) (string, error) {
	if err := ValidateSlug(slug); err != nil {
		return "", err
	}

	docDir := filepath.Join(rootDir, "docs", cfg.Subdir)
	numberRe := regexp.MustCompile(`^` + cfg.Prefix + `-(\d+)`)

	const maxRetries = 5
	for attempt := range maxRetries {
		num, err := nextNumber(docDir, numberRe)
		if err != nil {
			return "", fmt.Errorf("determining next %s number: %w", cfg.Prefix, err)
		}

		content, err := render(cfg.Template, num, slug)
		if err != nil {
			return "", err
		}

		filename := fmt.Sprintf("%s-%03d-%s.md", cfg.Prefix, num, slug)
		dest := filepath.Join(docDir, filename)

		err = writeExclusive(dest, content)
		if err == nil {
			return dest, nil
		}
		if !errors.Is(err, os.ErrExist) {
			return "", fmt.Errorf("writing %s: %w", filename, err)
		}
		// File already exists (concurrent creation) — retry with new number
		_ = attempt
	}

	return "", fmt.Errorf("could not create %s after %d attempts (concurrent collision)", cfg.Prefix, maxRetries)
}

// NextNumber scans a document directory and returns the next sequential number.
func NextNumber(docDir string, prefix string) (int, error) {
	numberRe := regexp.MustCompile(`^` + prefix + `-(\d+)`)
	return nextNumber(docDir, numberRe)
}

func nextNumber(docDir string, numberRe *regexp.Regexp) (int, error) {
	entries, err := os.ReadDir(docDir)
	if err != nil {
		return 0, fmt.Errorf("reading directory: %w", err)
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

// ValidateSlug checks that a slug is valid kebab-case.
func ValidateSlug(slug string) error {
	if slug == "" {
		return fmt.Errorf("slug is required")
	}
	if !slugRe.MatchString(slug) {
		return fmt.Errorf("slug must be lowercase alphanumeric with hyphens (e.g., 'use-nats-for-events')")
	}
	return nil
}

func render(templateName string, num int, slug string) ([]byte, error) {
	tmpls, err := loadTemplates()
	if err != nil {
		return nil, fmt.Errorf("loading templates: %w", err)
	}

	data := TemplateData{
		Number: num,
		Slug:   slug,
		Padded: fmt.Sprintf("%03d", num),
	}

	var buf bytes.Buffer
	if err := tmpls.ExecuteTemplate(&buf, templateName, data); err != nil {
		return nil, fmt.Errorf("rendering template %s: %w", templateName, err)
	}

	return buf.Bytes(), nil
}

func writeExclusive(dest string, content []byte) error {
	f, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o666)
	if err != nil {
		return err
	}
	defer f.Close()

	if _, err := f.Write(content); err != nil {
		os.Remove(dest)
		return err
	}

	return nil
}
