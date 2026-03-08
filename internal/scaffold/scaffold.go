package scaffold

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"text/template"

	"github.com/delightfulhammers/telesis/internal/config"
	"github.com/delightfulhammers/telesis/internal/context"
	"github.com/delightfulhammers/telesis/templates"
)

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

// Scaffold initializes a new Telesis project structure at rootDir.
// It creates the config, document stubs, directory structure, and initial CLAUDE.md.
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

	if cfg.Project.Status == "" {
		cfg.Project.Status = "active"
	}

	if err := config.Save(rootDir, cfg); err != nil {
		return fmt.Errorf("saving config: %w", err)
	}

	if err := createDirectories(rootDir); err != nil {
		return err
	}

	if err := renderDocStubs(rootDir, cfg); err != nil {
		return err
	}

	if err := writeREADMEStubs(rootDir); err != nil {
		return err
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
	return nil
}

func createDirectories(rootDir string) error {
	dirs := []string{
		filepath.Join(rootDir, "docs", "adr"),
		filepath.Join(rootDir, "docs", "tdd"),
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
	tmplContent, err := templates.FS.ReadFile(name)
	if err != nil {
		return nil, fmt.Errorf("reading template %s: %w", name, err)
	}

	tmpl, err := template.New(name).Parse(string(tmplContent))
	if err != nil {
		return nil, fmt.Errorf("parsing template %s: %w", name, err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return nil, fmt.Errorf("executing template %s: %w", name, err)
	}

	return buf.Bytes(), nil
}

func writeFileAtomic(dest string, content []byte) error {
	dir := filepath.Dir(dest)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("creating directory: %w", err)
	}

	tmp, err := os.CreateTemp(dir, ".scaffold-*")
	if err != nil {
		return fmt.Errorf("creating temp file: %w", err)
	}
	tmpPath := tmp.Name()

	if _, err := tmp.Write(content); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("writing temp file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("closing temp file: %w", err)
	}
	if err := os.Chmod(tmpPath, 0o644); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("setting permissions: %w", err)
	}
	if err := os.Rename(tmpPath, dest); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("renaming temp file: %w", err)
	}

	return nil
}
