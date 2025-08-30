//go:build dev

package main

import (
	"github.com/catkins/mcp-bouncer/pkg/api"
	"github.com/catkins/mcp-bouncer/pkg/services/mcp"
	"github.com/catkins/mcp-bouncer/pkg/services/settings"
)

func startDevServer(mcpService *mcp.MCPService, settingsService *settings.SettingsService) {
	apiServer := api.NewAPIServer(mcpService, settingsService)
	go apiServer.Start()
}
