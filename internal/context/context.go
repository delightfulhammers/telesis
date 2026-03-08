package context

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"text/template"
	"time"

	"github.com/delightfulhammers/telesis/internal/config"
	"github.com/delightfulhammers/telesis/templates"
)

type templateData struct {
	ProjectName       string
	ProjectOwner      string
	ProjectLanguage   string
	ProjectStatus     string
	ProjectRepo       string
	GeneratedDate     string
	MilestonesContent string
	ADRs              []string
	ADRCount          int
	TDDCount          int
	Principles        string
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

	adrs, adrCount, err := scanADRs(filepath.Join(rootDir, "docs", "adr"))
	if err != nil {
		return "", fmt.Errorf("scanning ADRs: %w", err)
	}
	data.ADRs = adrs
	data.ADRCount = adrCount

	tddCount, err := countFiles(filepath.Join(rootDir, "docs", "tdd"), "TDD-*.md")
	if err != nil {
		return "", fmt.Errorf("counting TDDs: %w", err)
	}
	data.TDDCount = tddCount

	milestones, err := extractMilestones(filepath.Join(rootDir, "docs", "MILESTONES.md"))
	if err != nil {
		return "", fmt.Errorf("reading milestones: %w", err)
	}
	data.MilestonesContent = milestones

	principles, err := extractPrinciples(filepath.Join(rootDir, "docs", "VISION.md"))
	if err != nil {
		return "", fmt.Errorf("reading vision: %w", err)
	}
	data.Principles = principles

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

var adrNumberRe = regexp.MustCompile(`^ADR-(\d+)`)

type numberedADR struct {
	path string
	num  int
}

func scanADRs(adrDir string) ([]string, int, error) {
	matches, err := filepath.Glob(filepath.Join(adrDir, "ADR-*.md"))
	if err != nil {
		return nil, 0, fmt.Errorf("globbing ADR directory: %w", err)
	}
	if len(matches) == 0 {
		return nil, 0, nil
	}

	// Pre-compute ADR numbers for sorting
	adrs := make([]numberedADR, len(matches))
	for i, path := range matches {
		adrs[i] = numberedADR{path: path, num: parseADRNumber(path)}
	}

	sort.Slice(adrs, func(i, j int) bool {
		return adrs[i].num < adrs[j].num
	})

	// Return up to 5 most recent (highest numbered)
	start := 0
	if len(adrs) > 5 {
		start = len(adrs) - 5
	}
	recent := adrs[start:]

	var summaries []string
	for _, adr := range recent {
		summary, err := extractADRSummary(adr.path)
		if err != nil {
			return nil, 0, fmt.Errorf("reading ADR %s: %w", filepath.Base(adr.path), err)
		}
		summaries = append(summaries, summary)
	}

	return summaries, len(adrs), nil
}

func parseADRNumber(path string) int {
	name := filepath.Base(path)
	if m := adrNumberRe.FindStringSubmatch(name); len(m) > 1 {
		n, _ := strconv.Atoi(m[1])
		return n
	}
	return 0
}

var adrTitleRe = regexp.MustCompile(`^#\s+ADR-\d+:\s*(.+)`)

func extractADRSummary(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	filename := filepath.Base(path)
	name := strings.TrimSuffix(filename, ".md")

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if m := adrTitleRe.FindStringSubmatch(line); len(m) > 1 {
			return fmt.Sprintf("%s: %s", name, m[1]), nil
		}
	}
	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("scanning %s: %w", filename, err)
	}

	return name, nil
}

func countFiles(dir, pattern string) (int, error) {
	matches, err := filepath.Glob(filepath.Join(dir, pattern))
	if err != nil {
		return 0, fmt.Errorf("globbing %s: %w", dir, err)
	}
	return len(matches), nil
}

var principlesHeaderRe = regexp.MustCompile(`(?i)^##\s+Design Principles`)

func extractPrinciples(visionPath string) (string, error) {
	f, err := os.Open(visionPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil
		}
		return "", err
	}
	defer f.Close()

	var capturing bool
	var result []string

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if principlesHeaderRe.MatchString(line) {
			capturing = true
			continue
		}
		if capturing {
			if strings.HasPrefix(line, "## ") || strings.HasPrefix(line, "---") {
				break
			}
			result = append(result, line)
		}
	}
	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("scanning vision: %w", err)
	}

	return strings.TrimSpace(strings.Join(result, "\n")), nil
}

var milestonesHeaderRe = regexp.MustCompile(`(?i)^##\s+MVP`)

func extractMilestones(milestonesPath string) (string, error) {
	f, err := os.Open(milestonesPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil
		}
		return "", err
	}
	defer f.Close()

	var capturing bool
	var result []string

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if milestonesHeaderRe.MatchString(line) {
			capturing = true
			result = append(result, line)
			continue
		}
		if capturing {
			if strings.HasPrefix(line, "## ") || line == "---" {
				break
			}
			result = append(result, line)
		}
	}
	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("scanning milestones: %w", err)
	}

	return strings.TrimSpace(strings.Join(result, "\n")), nil
}
