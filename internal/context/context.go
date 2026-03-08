package context

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"text/template"
	"time"

	"github.com/delightfulhammers/telesis/internal/config"
	"github.com/delightfulhammers/telesis/templates"
)

type templateData struct {
	ProjectName      string
	ProjectOwner     string
	ProjectLanguage  string
	ProjectStatus    string
	ProjectRepo      string
	GeneratedDate    string
	MilestonesContent string
	ADRs             []string
	ADRCount         int
	TDDCount         int
	Principles       string
}

func Generate(rootDir string) (string, error) {
	cfg, err := config.Load(rootDir)
	if err != nil {
		return "", err
	}

	data := templateData{
		ProjectName:     cfg.Project.Name,
		ProjectOwner:    cfg.Project.Owner,
		ProjectLanguage: cfg.Project.Language,
		ProjectStatus:   cfg.Project.Status,
		ProjectRepo:     cfg.Project.Repo,
		GeneratedDate:   time.Now().Format("2006-01-02"),
	}

	data.ADRs, data.ADRCount = scanADRs(filepath.Join(rootDir, "docs", "adr"))
	data.TDDCount = countFiles(filepath.Join(rootDir, "docs", "tdd"), "TDD-*.md")
	data.MilestonesContent = extractMilestones(filepath.Join(rootDir, "docs", "MILESTONES.md"))
	data.Principles = extractPrinciples(filepath.Join(rootDir, "docs", "VISION.md"))

	tmplContent, err := templates.FS.ReadFile("claude.md.tmpl")
	if err != nil {
		return "", fmt.Errorf("could not read template: %w", err)
	}

	tmpl, err := template.New("claude").Parse(string(tmplContent))
	if err != nil {
		return "", fmt.Errorf("could not parse template: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("could not render template: %w", err)
	}

	return buf.String(), nil
}

func scanADRs(adrDir string) ([]string, int) {
	matches, err := filepath.Glob(filepath.Join(adrDir, "ADR-*.md"))
	if err != nil || len(matches) == 0 {
		return nil, 0
	}

	sort.Strings(matches)

	// Return up to 5 most recent (last in sorted order)
	start := 0
	if len(matches) > 5 {
		start = len(matches) - 5
	}
	recent := matches[start:]

	var summaries []string
	for _, path := range recent {
		summary := extractADRSummary(path)
		if summary != "" {
			summaries = append(summaries, summary)
		}
	}

	return summaries, len(matches)
}

var adrTitleRe = regexp.MustCompile(`^#\s+ADR-\d+:\s*(.+)`)

func extractADRSummary(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}

	filename := filepath.Base(path)
	name := strings.TrimSuffix(filename, ".md")

	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		if m := adrTitleRe.FindStringSubmatch(strings.TrimSpace(line)); len(m) > 1 {
			return fmt.Sprintf("%s: %s", name, m[1])
		}
	}

	return name
}

func countFiles(dir, pattern string) int {
	matches, err := filepath.Glob(filepath.Join(dir, pattern))
	if err != nil {
		return 0
	}
	return len(matches)
}

var principlesHeaderRe = regexp.MustCompile(`(?i)^##\s+Design Principles`)

func extractPrinciples(visionPath string) string {
	data, err := os.ReadFile(visionPath)
	if err != nil {
		return ""
	}

	lines := strings.Split(string(data), "\n")
	var capturing bool
	var result []string

	for _, line := range lines {
		if principlesHeaderRe.MatchString(line) {
			capturing = true
			continue
		}
		if capturing {
			// Stop at next section header
			if strings.HasPrefix(line, "## ") || strings.HasPrefix(line, "---") {
				break
			}
			result = append(result, line)
		}
	}

	return strings.TrimSpace(strings.Join(result, "\n"))
}

var milestonesHeaderRe = regexp.MustCompile(`(?i)^##\s+MVP`)

func extractMilestones(milestonesPath string) string {
	data, err := os.ReadFile(milestonesPath)
	if err != nil {
		return ""
	}

	lines := strings.Split(string(data), "\n")
	var capturing bool
	var result []string

	for _, line := range lines {
		if milestonesHeaderRe.MatchString(line) {
			capturing = true
			result = append(result, line)
			continue
		}
		if capturing {
			// Stop at next h2 section or horizontal rule before next section
			if strings.HasPrefix(line, "## ") {
				break
			}
			if line == "---" {
				break
			}
			result = append(result, line)
		}
	}

	return strings.TrimSpace(strings.Join(result, "\n"))
}
