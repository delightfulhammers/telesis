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
	Description       string
	MilestonesContent string
	ADRs              []string
	ADRCount          int
	TDDCount          int
	Principles        string
	ContextSections   []contextSection
}

type contextSection struct {
	Content string
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

	description, err := extractSection(filepath.Join(rootDir, "docs", "VISION.md"), descriptionHeaderRe)
	if err != nil {
		return "", fmt.Errorf("reading description: %w", err)
	}
	data.Description = stripLeadingHeading(description)

	contextSections, err := scanContextFiles(filepath.Join(rootDir, "docs", "context"))
	if err != nil {
		return "", fmt.Errorf("reading context files: %w", err)
	}
	data.ContextSections = contextSections

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
	entries, err := os.ReadDir(adrDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, 0, nil
		}
		return nil, 0, fmt.Errorf("reading ADR directory: %w", err)
	}

	var adrs []numberedADR
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		matched, _ := filepath.Match("ADR-*.md", entry.Name())
		if matched {
			p := filepath.Join(adrDir, entry.Name())
			adrs = append(adrs, numberedADR{path: p, num: parseADRNumber(p)})
		}
	}
	if len(adrs) == 0 {
		return nil, 0, nil
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
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return 0, nil
		}
		return 0, fmt.Errorf("reading %s: %w", dir, err)
	}
	count := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		matched, _ := filepath.Match(pattern, entry.Name())
		if matched {
			count++
		}
	}
	return count, nil
}

var (
	principlesHeaderRe  = regexp.MustCompile(`(?i)^##\s+Design Principles`)
	descriptionHeaderRe = regexp.MustCompile(`(?i)^##\s+The Vision`)
)

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
	return extractSection(milestonesPath, milestonesHeaderRe)
}

// extractSection extracts content under the first heading matching the given
// compiled regex, stopping at the next ## heading or --- separator. The matched
// heading line is included in the output.
func extractSection(path string, re *regexp.Regexp) (string, error) {
	f, err := os.Open(path)
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
		if !capturing && re.MatchString(line) {
			capturing = true
			result = append(result, line)
			continue
		}
		if capturing {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "## ") || trimmed == "---" {
				break
			}
			result = append(result, line)
		}
	}
	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("scanning %s: %w", filepath.Base(path), err)
	}

	return strings.TrimSpace(strings.Join(result, "\n")), nil
}

// stripLeadingHeading removes a markdown heading from the first line if present,
// returning just the body content. Used when the template provides its own heading.
func stripLeadingHeading(s string) string {
	lines := strings.SplitN(s, "\n", 2)
	if len(lines) > 0 && strings.HasPrefix(strings.TrimSpace(lines[0]), "#") {
		if len(lines) > 1 {
			return strings.TrimSpace(lines[1])
		}
		return ""
	}
	return s
}

func scanContextFiles(contextDir string) ([]contextSection, error) {
	entries, err := os.ReadDir(contextDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}

	var sections []contextSection
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		content, err := os.ReadFile(filepath.Join(contextDir, entry.Name()))
		if err != nil {
			return nil, fmt.Errorf("reading %s: %w", entry.Name(), err)
		}
		sections = append(sections, contextSection{
			Content: strings.TrimSpace(string(content)),
		})
	}
	return sections, nil
}
