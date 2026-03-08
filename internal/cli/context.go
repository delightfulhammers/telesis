package cli

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/delightfulhammers/telesis/internal/context"
	"github.com/spf13/cobra"
)

func init() {
	rootCmd.AddCommand(contextCmd)
}

var contextCmd = &cobra.Command{
	Use:   "context",
	Short: "Regenerate CLAUDE.md from current document state",
	Long:  "Reads the project document tree and generates an updated CLAUDE.md for Claude Code.",
	RunE:  runContext,
}

func runContext(cmd *cobra.Command, args []string) error {
	rootDir, err := projectRoot()
	if err != nil {
		return fmt.Errorf("could not determine project root: %w", err)
	}

	output, err := context.Generate(rootDir)
	if err != nil {
		return err
	}

	claudePath := filepath.Join(rootDir, "CLAUDE.md")
	if err := os.WriteFile(claudePath, []byte(output), 0o644); err != nil {
		return fmt.Errorf("could not write CLAUDE.md: %w", err)
	}

	fmt.Println("CLAUDE.md regenerated successfully.")
	return nil
}
