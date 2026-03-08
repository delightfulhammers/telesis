package scaffold

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"text/template"

	"github.com/delightfulhammers/telesis/internal/config"
	"github.com/delightfulhammers/telesis/internal/context"
	"github.com/delightfulhammers/telesis/templates"
)

var tempCounter atomic.Int64

type templateData struct {
	ProjectName  string
	ProjectOwner string
}

// docFile maps a template name to its output path relative to rootDir.
type docFile struct {
	template string
	dest     string
}

var docFiles = []docFile{
	{"vision.md.tmpl", "docs/VISION.md"},
	{"prd.md.tmpl", "docs/PRD.md"},
	{"architecture.md.tmpl", "docs/ARCHITECTURE.md"},
	{"milestones.md.tmpl", "docs/MILESTONES.md"},
}

var readmeStubs = map[string]string{
	"docs/adr/README.md": "# Architectural Decision Records (ADRs)\n\nThis directory contains ADR files created by `telesis adr new <slug>`.\n\nEach ADR captures a significant architectural decision with its context, rationale, and consequences.\n",
	"docs/tdd/README.md": "# Technical Design Documents (TDDs)\n\nThis directory contains TDD files created by `telesis tdd new <slug>`.\n\nEach TDD details the design of a specific component or subsystem.\n",
}

var (
	docTemplates     *template.Template
	docTemplatesOnce sync.Once
	docTemplatesErr  error
)

func loadTemplates() (*template.Template, error) {
	docTemplatesOnce.Do(func() {
		docTemplates, docTemplatesErr = template.ParseFS(templates.FS, "*.tmpl")
	})
	return docTemplates, docTemplatesErr
}

// Scaffold initializes a new Telesis project structure at rootDir.
// It creates the document stubs, directory structure, initial CLAUDE.md,
// and config file. The config is written last so that a partial failure
// does not leave the project in an "already initialized" state.
func Scaffold(rootDir string, cfg *config.Config) error {
	if err := validateInput(cfg); err != nil {
		return err
	}

	exists, err := config.Exists(rootDir)
	if err != nil {
		return fmt.Errorf("checking existing config: %w", err)
	}
	if exists {
		return fmt.Errorf("project already initialized (run `telesis context` to regenerate CLAUDE.md)")
	}

	local := applyDefaults(cfg)

	if err := createDirectories(rootDir); err != nil {
		return err
	}

	if err := renderDocStubs(rootDir, local); err != nil {
		return err
	}

	if err := writeREADMEStubs(rootDir); err != nil {
		return err
	}

	// Config must be saved before CLAUDE.md generation (context.Generate reads it),
	// but this is safe because generateCLAUDEMD is the last fallible step — if it
	// fails, config exists but the user can simply run `telesis context` to retry.
	if err := config.Save(rootDir, local); err != nil {
		return fmt.Errorf("saving config: %w", err)
	}

	if err := generateCLAUDEMD(rootDir); err != nil {
		return err
	}

	return nil
}

func validateInput(cfg *config.Config) error {
	if cfg.Project.Name == "" {
		return fmt.Errorf("project name is required")
	}
	fields := []struct{ name, value string }{
		{"name", cfg.Project.Name},
		{"owner", cfg.Project.Owner},
		{"language", cfg.Project.Language},
		{"repo", cfg.Project.Repo},
	}
	for _, f := range fields {
		field, val := f.name, f.value
		if strings.ContainsAny(val, "\x00\n\r") {
			return fmt.Errorf("project %s contains invalid characters (newlines or null bytes)", field)
		}
		if strings.Contains(val, "{{") {
			return fmt.Errorf("project %s contains invalid character sequence '{{' ", field)
		}
	}
	return nil
}

func applyDefaults(cfg *config.Config) *config.Config {
	local := &config.Config{
		Project: cfg.Project,
	}
	if local.Project.Status == "" {
		local.Project.Status = "active"
	}
	return local
}

func createDirectories(rootDir string) error {
	dirs := []string{
		filepath.Join(rootDir, "docs", "adr"),
		filepath.Join(rootDir, "docs", "tdd"),
		filepath.Join(rootDir, "docs", "context"),
	}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("creating directory %s: %w", dir, err)
		}
	}
	return nil
}

func renderDocStubs(rootDir string, cfg *config.Config) error {
	data := templateData{
		ProjectName:  cfg.Project.Name,
		ProjectOwner: cfg.Project.Owner,
	}

	for _, df := range docFiles {
		content, err := renderTemplate(df.template, data)
		if err != nil {
			return fmt.Errorf("rendering %s: %w", df.template, err)
		}
		dest := filepath.Join(rootDir, df.dest)
		if err := writeFileAtomic(dest, content); err != nil {
			return fmt.Errorf("writing %s: %w", df.dest, err)
		}
	}
	return nil
}

func writeREADMEStubs(rootDir string) error {
	for relPath, content := range readmeStubs {
		dest := filepath.Join(rootDir, relPath)
		if err := writeFileAtomic(dest, []byte(content)); err != nil {
			return fmt.Errorf("writing %s: %w", relPath, err)
		}
	}
	return nil
}

func generateCLAUDEMD(rootDir string) error {
	output, err := context.Generate(rootDir)
	if err != nil {
		return fmt.Errorf("generating CLAUDE.md: %w", err)
	}

	dest := filepath.Join(rootDir, "CLAUDE.md")
	if err := writeFileAtomic(dest, []byte(output)); err != nil {
		return fmt.Errorf("writing CLAUDE.md: %w", err)
	}

	return nil
}

func renderTemplate(name string, data templateData) ([]byte, error) {
	tmpls, err := loadTemplates()
	if err != nil {
		return nil, fmt.Errorf("loading templates: %w", err)
	}
	var buf bytes.Buffer
	if err := tmpls.ExecuteTemplate(&buf, name, data); err != nil {
		return nil, fmt.Errorf("executing template %s: %w", name, err)
	}
	return buf.Bytes(), nil
}

func writeFileAtomic(dest string, content []byte) error {
	dir := filepath.Dir(dest)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("creating directory: %w", err)
	}

	tmpPath := filepath.Join(dir, fmt.Sprintf(".scaffold-%d-%d", os.Getpid(), tempCounter.Add(1)))
	tmp, err := os.OpenFile(tmpPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o666)
	if err != nil {
		return fmt.Errorf("creating temp file: %w", err)
	}

	success := false
	defer func() {
		if !success {
			tmp.Close()
			os.Remove(tmpPath)
		}
	}()

	if _, err := tmp.Write(content); err != nil {
		tmp.Close()
		return fmt.Errorf("writing temp file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("closing temp file: %w", err)
	}
	if err := os.Rename(tmpPath, dest); err != nil {
		return fmt.Errorf("renaming temp file: %w", err)
	}

	success = true
	return nil
}
