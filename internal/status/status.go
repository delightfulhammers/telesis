package status

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/delightfulhammers/telesis/internal/config"
)

// Status holds the aggregated project state.
type Status struct {
	ProjectName        string
	ProjectStatus      string
	ADRCount           int
	TDDCount           int
	ActiveMilestone    string
	ContextGeneratedAt time.Time
}

// GetStatus reads the project state from the filesystem.
func GetStatus(rootDir string) (*Status, error) {
	cfg, err := config.Load(rootDir)
	if err != nil {
		return nil, err
	}

	adrCount, err := countFiles(filepath.Join(rootDir, "docs", "adr"), "ADR-*.md")
	if err != nil {
		return nil, fmt.Errorf("counting ADRs: %w", err)
	}

	tddCount, err := countFiles(filepath.Join(rootDir, "docs", "tdd"), "TDD-*.md")
	if err != nil {
		return nil, fmt.Errorf("counting TDDs: %w", err)
	}

	milestone, err := extractActiveMilestone(filepath.Join(rootDir, "docs", "MILESTONES.md"))
	if err != nil {
		return nil, fmt.Errorf("reading milestones: %w", err)
	}

	contextTime := contextTimestamp(filepath.Join(rootDir, "CLAUDE.md"))

	return &Status{
		ProjectName:        cfg.Project.Name,
		ProjectStatus:      cfg.Project.Status,
		ADRCount:           adrCount,
		TDDCount:           tddCount,
		ActiveMilestone:    milestone,
		ContextGeneratedAt: contextTime,
	}, nil
}

func countFiles(dir, pattern string) (int, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return 0, nil
		}
		return 0, err
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

var milestoneHeaderRe = regexp.MustCompile(`(?i)^##\s+MVP`)

func extractActiveMilestone(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil
		}
		return "", err
	}
	defer f.Close()

	var capturing bool
	var lines []string

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if milestoneHeaderRe.MatchString(line) {
			capturing = true
			lines = append(lines, line)
			continue
		}
		if capturing {
			if strings.HasPrefix(line, "## ") || line == "---" {
				break
			}
			lines = append(lines, line)
		}
	}
	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("scanning milestones: %w", err)
	}

	return strings.TrimSpace(strings.Join(lines, "\n")), nil
}

func contextTimestamp(path string) time.Time {
	info, err := os.Stat(path)
	if err != nil {
		return time.Time{}
	}
	return info.ModTime()
}
