package mcp

import (
	"context"
	"fmt"
	"math/rand"
	"time"

	"github.com/catkins/mcp-bouncer-poc/pkg/services/settings"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type MCPService struct {
	listenAddr string
	callback   func(e *application.CustomEvent)
	server     *Server
	settings   *settings.SettingsService
}

const defaultListenAddr = "localhost:8091"

func NewMCPService(settingsService *settings.SettingsService) *MCPService {
	return &MCPService{
		listenAddr: defaultListenAddr,
		server:     NewServer(defaultListenAddr),
		settings:   settingsService,
	}
}

func (s *MCPService) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	// Use settings if available
	if s.settings != nil {
		s.listenAddr = s.settings.GetListenAddr()
		s.server = NewServer(s.listenAddr)
	}

	go func() {
		s.server.Start(ctx)
	}()

	go func() {
		s.startTicker(ctx)
	}()

	return nil
}

func (s *MCPService) startTicker(ctx context.Context) error {
	ticker := time.NewTicker(5 * time.Second)
	for {
		select {
		case <-ticker.C:
			s.emitEvent("mcp:servers_updated", map[string]any{})

		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func (s *MCPService) IsActive() bool {
	return s.server.active
}

func (s *MCPService) Subscribe(callback func(e *application.CustomEvent)) {
	s.callback = callback
}

func (s *MCPService) List() ([]settings.MCPServerConfig, error) {
	if s.settings != nil {
		return s.settings.GetMCPServers(), nil
	}

	// Fallback to mock data if no settings service
	servers := []settings.MCPServerConfig{}
	for i := 0; i < rand.Intn(5)+1; i++ {
		servers = append(servers, settings.MCPServerConfig{
			Name:        fmt.Sprintf("service%d", i+1),
			Description: fmt.Sprintf("Mock service %d", i+1),
			Command:     fmt.Sprintf("mock-command-%d", i+1),
			Enabled:     rand.Intn(2) == 1,
		})
	}
	return servers, nil
}

func (s *MCPService) ListenAddr() string {
	return fmt.Sprintf("http://%s/mcp", s.listenAddr)
}

// AddMCPServer adds a new MCP server configuration
func (s *MCPService) AddMCPServer(config settings.MCPServerConfig) error {
	if s.settings != nil {
		return s.settings.AddMCPServer(config)
	}
	return fmt.Errorf("settings service not available")
}

// RemoveMCPServer removes an MCP server configuration
func (s *MCPService) RemoveMCPServer(name string) error {
	if s.settings != nil {
		return s.settings.RemoveMCPServer(name)
	}
	return fmt.Errorf("settings service not available")
}

// UpdateMCPServer updates an MCP server configuration
func (s *MCPService) UpdateMCPServer(name string, config settings.MCPServerConfig) error {
	if s.settings != nil {
		return s.settings.UpdateMCPServer(name, config)
	}
	return fmt.Errorf("settings service not available")
}

// GetSettings returns the current settings
func (s *MCPService) GetSettings() *settings.Settings {
	if s.settings != nil {
		return s.settings.GetSettings()
	}
	return nil
}

// UpdateSettings updates the settings
func (s *MCPService) UpdateSettings(settings *settings.Settings) error {
	if s.settings != nil {
		return s.settings.UpdateSettings(settings)
	}
	return fmt.Errorf("settings service not available")
}

func (s *MCPService) emitEvent(name string, data any) {
	s.callback(&application.CustomEvent{
		Name:   name,
		Data:   data,
		Sender: "mcp_service",
	})
}
