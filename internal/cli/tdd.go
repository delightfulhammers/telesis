package cli

import (
	"fmt"

	"github.com/delightfulhammers/telesis/internal/tdd"
	"github.com/spf13/cobra"
)

func init() {
	tddCmd.AddCommand(tddNewCmd)
	rootCmd.AddCommand(tddCmd)
}

var tddCmd = &cobra.Command{
	Use:   "tdd",
	Short: "Manage technical design documents",
}

var tddNewCmd = &cobra.Command{
	Use:   "new <slug>",
	Short: "Create a new TDD from template",
	Long:  "Creates a new TDD with the next sequential number. Slug should be lowercase with hyphens (e.g., 'config-loader').",
	Args:  cobra.ExactArgs(1),
	RunE:  runTDDNew,
}

func runTDDNew(cmd *cobra.Command, args []string) error {
	rootDir, err := projectRoot()
	if err != nil {
		return fmt.Errorf("could not determine project root: %w", err)
	}

	path, err := tdd.Create(rootDir, args[0])
	if err != nil {
		return err
	}

	fmt.Printf("Created %s\n", path)
	return nil
}
