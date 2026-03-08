package cli

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "telesis",
	Short: "Development intelligence platform",
	Long:  "Telesis manages structured project context for autonomous coding agents.",
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func projectRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("could not get working directory: %w", err)
	}

	for {
		if _, err := os.Stat(filepath.Join(dir, ".telesis", "config.yml")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("no .telesis/config.yml found (run `telesis init` first)")
		}
		dir = parent
	}
}
