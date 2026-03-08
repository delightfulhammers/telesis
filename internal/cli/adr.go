package cli

import (
	"fmt"

	"github.com/delightfulhammers/telesis/internal/adr"
	"github.com/spf13/cobra"
)

func init() {
	adrCmd.AddCommand(adrNewCmd)
	rootCmd.AddCommand(adrCmd)
}

var adrCmd = &cobra.Command{
	Use:   "adr",
	Short: "Manage architectural decision records",
}

var adrNewCmd = &cobra.Command{
	Use:   "new <slug>",
	Short: "Create a new ADR from template",
	Long:  "Creates a new ADR with the next sequential number. Slug should be lowercase with hyphens (e.g., 'use-nats-for-events').",
	Args:  cobra.ExactArgs(1),
	RunE:  runADRNew,
}

func runADRNew(cmd *cobra.Command, args []string) error {
	rootDir, err := projectRoot()
	if err != nil {
		return fmt.Errorf("could not determine project root: %w", err)
	}

	path, err := adr.Create(rootDir, args[0])
	if err != nil {
		return err
	}

	fmt.Printf("Created %s\n", path)
	return nil
}
