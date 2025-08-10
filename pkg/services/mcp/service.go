package mcp

import (
	"context"
	"fmt"
	"log/slog"
	"math/rand"

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

		// Subscribe to settings updates
		s.settings.Subscribe(func(event *application.CustomEvent) {
			if event.Name == "settings:updated" {
				slog.Info("Settings updated, reloading clients")
				if err := s.ReloadClients(); err != nil {
					slog.Error("Failed to reload clients", "error", err)
				}
			}
		})
	}

	// Start the server
	go func() {
		s.server.Start(ctx)
	}()

	// Load clients from settings asynchronously
	go func() {
		if s.settings != nil {
			settings := s.settings.GetSettings()
			if settings != nil {
				slog.Info("Loading clients from settings", "client_count", len(settings.MCPServers))
				if err := s.server.GetClientManager().LoadClientsFromSettings(ctx, settings); err != nil {
					slog.Error("Failed to load clients from settings", "error", err)
				}
			}
		}
	}()

	return nil
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
		err := s.settings.AddMCPServer(config)
		if err != nil {
			return err
		}
		// Emit event to notify frontend that servers have been updated
		s.emitEvent("mcp:servers_updated", map[string]any{})
		return nil
	}
	return fmt.Errorf("settings service not available")
}

// RemoveMCPServer removes an MCP server configuration
func (s *MCPService) RemoveMCPServer(name string) error {
	if s.settings != nil {
		err := s.settings.RemoveMCPServer(name)
		if err != nil {
			return err
		}
		// Emit event to notify frontend that servers have been updated
		s.emitEvent("mcp:servers_updated", map[string]any{})
		return nil
	}
	return fmt.Errorf("settings service not available")
}

// UpdateMCPServer updates an MCP server configuration
func (s *MCPService) UpdateMCPServer(name string, config settings.MCPServerConfig) error {
	if s.settings != nil {
		err := s.settings.UpdateMCPServer(name, config)
		if err != nil {
			return err
		}
		// Emit event to notify frontend that servers have been updated
		s.emitEvent("mcp:servers_updated", map[string]any{})
		return nil
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

// StartClient starts an MCP client
func (s *MCPService) StartClient(config settings.MCPServerConfig) error {
	if s.server != nil {
		return s.server.GetClientManager().StartClient(context.Background(), config)
	}
	return fmt.Errorf("server not available")
}

// StopClient stops an MCP client
func (s *MCPService) StopClient(name string) error {
	if s.server != nil {
		return s.server.GetClientManager().StopClient(name)
	}
	return fmt.Errorf("server not available")
}

// RestartClient restarts an MCP client
func (s *MCPService) RestartClient(name string) error {
	if s.server != nil {
		return s.server.GetClientManager().RestartClient(context.Background(), name)
	}
	return fmt.Errorf("server not available")
}

// GetClientStatus returns the status of all clients
func (s *MCPService) GetClientStatus() map[string]ClientStatus {
	if s.server != nil {
		return s.server.GetClientManager().GetClientStatus()
	}
	return make(map[string]ClientStatus)
}

// ReloadClients reloads all clients from settings
func (s *MCPService) ReloadClients() error {
	if s.settings != nil && s.server != nil {
		settings := s.settings.GetSettings()
		if settings != nil {
			err := s.server.GetClientManager().LoadClientsFromSettings(context.Background(), settings)
			if err != nil {
				return err
			}
			// Emit event to notify frontend that servers have been updated
			s.emitEvent("mcp:servers_updated", map[string]any{})
			return nil
		}
	}
	return fmt.Errorf("settings or server not available")
}

func (s *MCPService) emitEvent(name string, data any) {
	slog.Info("Emitting event", "name", name, "data", data)
	if s.callback != nil {
		s.callback(&application.CustomEvent{
			Name:   name,
			Data:   data,
			Sender: "mcp_service",
		})
	} else {
		slog.Warn("No callback set for MCP service, cannot emit event", "name", name)
	}
}
