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
	tmpPath := filepath.Join(rootDir, fmt.Sprintf(".CLAUDE-%d.md", os.Getpid()))
	tmp, err := os.OpenFile(tmpPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o666)
	if err != nil {
		return fmt.Errorf("could not create temp file: %w", err)
	}

	success := false
	defer func() {
		if !success {
			os.Remove(tmpPath)
		}
	}()

	if _, err := tmp.WriteString(output); err != nil {
		tmp.Close()
		return fmt.Errorf("could not write CLAUDE.md: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("could not close CLAUDE.md: %w", err)
	}
	if err := os.Rename(tmpPath, claudePath); err != nil {
		return fmt.Errorf("could not finalize CLAUDE.md: %w", err)
	}

	success = true

	fmt.Println("CLAUDE.md regenerated successfully.")
	return nil
}
