package cli

import (
	"os"

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
	return os.Getwd()
}
