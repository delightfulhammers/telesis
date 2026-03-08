package cli

import (
	"fmt"

	"github.com/delightfulhammers/telesis/internal/config"
	"github.com/delightfulhammers/telesis/internal/scaffold"
	"github.com/spf13/cobra"
)

func init() {
	initCmd.Flags().StringP("name", "n", "", "project name (required)")
	initCmd.Flags().StringP("owner", "o", "", "project owner")
	initCmd.Flags().StringP("language", "l", "", "primary programming language")
	initCmd.Flags().StringP("repo", "r", "", "repository URL")

	rootCmd.AddCommand(initCmd)
}

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Initialize a new Telesis project",
	Long:  "Creates the Telesis document structure, config, and initial CLAUDE.md in the current directory.",
	RunE:  runInit,
}

func runInit(cmd *cobra.Command, args []string) error {
	name, _ := cmd.Flags().GetString("name")
	if name == "" {
		return fmt.Errorf("--name is required")
	}

	owner, _ := cmd.Flags().GetString("owner")
	language, _ := cmd.Flags().GetString("language")
	repo, _ := cmd.Flags().GetString("repo")

	cfg := &config.Config{
		Project: config.Project{
			Name:     name,
			Owner:    owner,
			Language: language,
			Repo:     repo,
		},
	}

	rootDir := "."

	if err := scaffold.Scaffold(rootDir, cfg); err != nil {
		return err
	}

	fmt.Printf("Telesis initialized for %s.\n", name)
	fmt.Println("Next steps:")
	fmt.Println("  1. Edit docs/VISION.md with your project vision")
	fmt.Println("  2. Edit docs/PRD.md with your requirements")
	fmt.Println("  3. Run `telesis context` to regenerate CLAUDE.md")
	return nil
}
