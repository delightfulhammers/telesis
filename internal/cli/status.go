package cli

import (
	"fmt"

	"github.com/delightfulhammers/telesis/internal/status"
	"github.com/spf13/cobra"
)

func init() {
	rootCmd.AddCommand(statusCmd)
}

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Print current project state",
	Long:  "Displays the project name, status, ADR/TDD counts, active milestone, and last context generation time.",
	RunE:  runStatus,
}

func runStatus(cmd *cobra.Command, args []string) error {
	rootDir, err := projectRoot()
	if err != nil {
		return fmt.Errorf("could not determine project root: %w", err)
	}

	s, err := status.GetStatus(rootDir)
	if err != nil {
		return err
	}

	fmt.Printf("Project:    %s\n", s.ProjectName)
	fmt.Printf("Status:     %s\n", s.ProjectStatus)
	fmt.Printf("ADRs:       %d\n", s.ADRCount)
	fmt.Printf("TDDs:       %d\n", s.TDDCount)

	if s.ActiveMilestone != "" {
		fmt.Printf("Milestone:  %s\n", firstLine(s.ActiveMilestone))
	} else {
		fmt.Println("Milestone:  (none)")
	}

	if !s.ContextGeneratedAt.IsZero() {
		fmt.Printf("CLAUDE.md:  last generated %s\n", s.ContextGeneratedAt.Format("2006-01-02 15:04:05"))
	} else {
		fmt.Println("CLAUDE.md:  not yet generated")
	}

	return nil
}

func firstLine(s string) string {
	for i, c := range s {
		if c == '\n' {
			return s[:i]
		}
	}
	return s
}
