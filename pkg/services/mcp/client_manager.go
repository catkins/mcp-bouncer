package mcp

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/catkins/mcp-bouncer/pkg/services/settings"
	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/client/transport"
	"github.com/mark3labs/mcp-go/mcp"
)

// ClientManager manages MCP client connections
type ClientManager struct {
	clients map[string]*ManagedClient
	mutex   sync.RWMutex
	server  *Server
}

// ManagedClient represents a managed MCP client connection
type ManagedClient struct {
	Config                settings.MCPServerConfig
	Client                *client.Client
	Transport             transport.Interface
	Tools                 []mcp.Tool
	Connected             bool
	LastError             string
	AuthorizationRequired bool
	OAuthAuthenticated    bool
	StopChan              chan struct{}
	RestartChan           chan struct{}
}

// ClientStatus represents the status of a client
type ClientStatus struct {
	Name                  string `json:"name"`
	Connected             bool   `json:"connected"`
	Tools                 int    `json:"tools"`
	LastError             string `json:"last_error,omitempty"`
	AuthorizationRequired bool   `json:"authorization_required"`
	OAuthAuthenticated    bool   `json:"oauth_authenticated"`
}

// NewClientManager creates a new client manager
func NewClientManager(server *Server) *ClientManager {
	return &ClientManager{
		clients: make(map[string]*ManagedClient),
		server:  server,
	}
}

// StartClient starts an MCP client based on configuration
func (cm *ClientManager) StartClient(ctx context.Context, config settings.MCPServerConfig) error {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	// Check if client already exists
	if existing, exists := cm.clients[config.Name]; exists {
		if existing.Connected {
			return fmt.Errorf("client '%s' is already running", config.Name)
		}
		// Clean up existing client
		cm.stopClientInternal(config.Name)
	}

	// Create new managed client
	mc := &ManagedClient{
		Config:      config,
		Connected:   false,
		StopChan:    make(chan struct{}),
		RestartChan: make(chan struct{}),
	}

	// Start the client process and create transport
	if err := cm.startClientProcess(mc); err != nil {
		return fmt.Errorf("failed to start client process: %w", err)
	}

	// Create client unless already provided by startClientProcess
	if mc.Client == nil {
		mcpClient := client.NewClient(mc.Transport)
		mc.Client = mcpClient
	}

	// Start the client
	if err := mc.Client.Start(ctx); err != nil {
		cm.stopClientInternal(config.Name)
		return fmt.Errorf("failed to start client: %w", err)
	}

	// Initialize the client
	if err := cm.initializeClient(ctx, mc); err != nil {
		// If initialization failed due to authorization, retain client entry and mark status
		if client.IsOAuthAuthorizationRequiredError(err) {
			mc.AuthorizationRequired = true
			mc.OAuthAuthenticated = false
			mc.LastError = fmt.Sprintf("** cm.initializeClient: %s", err.Error())
			cm.clients[config.Name] = mc

			slog.Warn("Client requires authorization", "name", config.Name, "error", err)

			cm.server.EmitEvent("mcp:client_status_changed", map[string]any{
				"server_name": config.Name,
				"status":      "authorization_required",
			})

			return nil
		}

		cm.stopClientInternal(config.Name)
		return fmt.Errorf("failed to initialize client: %w", err)
	}

	if err := cm.registerClientTools(ctx, mc); err != nil {
		cm.stopClientInternal(config.Name)
		return fmt.Errorf("failed to register client tools: %w", err)
	}

	mc.Connected = true
	cm.clients[config.Name] = mc

	go cm.monitorClient(ctx, mc)

	slog.Info("Started MCP client", "name", config.Name, "tools", len(mc.Tools))

	cm.server.EmitEvent("mcp:client_status_changed", map[string]any{
		"server_name": config.Name,
		"status":      "started",
	})
	return nil
}

// StopClient stops an MCP client
func (cm *ClientManager) StopClient(name string) error {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()
	return cm.stopClientInternal(name)
}

// stopClientInternal stops a client (assumes lock is held)
func (cm *ClientManager) stopClientInternal(name string) error {
	mc, exists := cm.clients[name]
	if !exists {
		// Client doesn't exist, which is fine when disabling a server
		slog.Debug("Client not found when stopping", "name", name)
		return nil
	}

	close(mc.StopChan)

	cm.removeClientTools(mc)

	if mc.Transport != nil {
		done := make(chan struct{})
		go func() {
			mc.Transport.Close()
			close(done)
		}()

		// Wait for transport close with timeout
		select {
		case <-done:
			slog.Debug("Transport closed successfully", "name", name)
		case <-time.After(5 * time.Second):
			slog.Warn("Transport close timed out", "name", name)
		}
	}

	delete(cm.clients, name)

	slog.Info("Stopped MCP client", "name", name)

	cm.server.EmitEvent("mcp:client_status_changed", map[string]any{
		"server_name": name,
		"status":      "stopped",
	})
	return nil
}

// RestartClient restarts an MCP client
func (cm *ClientManager) RestartClient(ctx context.Context, name string) error {
	cm.mutex.Lock()
	mc, exists := cm.clients[name]
	if !exists {
		// If not found, try to find config in settings via server and start afresh
		cm.mutex.Unlock()
		if cm.server != nil && cm.server.clientManager != nil {
			// Access settings indirectly is not available here; return a clear error
			return fmt.Errorf("client '%s' not found", name)
		}
		return fmt.Errorf("client '%s' not found", name)
	}
	config := mc.Config
	cm.mutex.Unlock()

	if err := cm.StopClient(name); err != nil {
		return fmt.Errorf("failed to stop client: %w", err)
	}

	// wait a bit before restarting
	time.Sleep(1 * time.Second)

	return cm.StartClient(ctx, config)
}

// AuthorizeClient runs an interactive OAuth flow for the given client if required
func (cm *ClientManager) AuthorizeClient(ctx context.Context, name string) error {
	cm.mutex.RLock()
	mc, exists := cm.clients[name]
	cm.mutex.RUnlock()
	if !exists {
		return fmt.Errorf("client '%s' not found", name)
	}

	defer func() {
		cm.server.EmitEvent("mcp:client_status_changed", map[string]any{})
	}()

	// Check if the server is configured to require authorization
	if !mc.Config.RequiresAuth {
		mc.LastError = fmt.Sprintf("server '%s' is not configured to require authorization", name)
		return fmt.Errorf("server '%s' is not configured to require authorization", name)
	}

	// Try an initialize call to retrieve the OAuth handler from the error
	_, err := mc.Client.Initialize(ctx, mcp.InitializeRequest{})
	if err == nil {
		return nil
	}

	if !client.IsOAuthAuthorizationRequiredError(err) {
		mc.LastError = fmt.Sprintf("authorization not required or unexpected error: %w", err)
		return fmt.Errorf("authorization not required or unexpected error: %w", err)
	}

	oauthHandler := client.GetOAuthHandler(err)
	if oauthHandler == nil {
		mc.LastError = "failed to obtain OAuth handler"
		return fmt.Errorf("failed to obtain OAuth handler")
	}

	// Start callback server
	callbackChan := make(chan map[string]string)
	srv := startOAuthCallbackServer(callbackChan)
	defer srv.Close()

	// PKCE and state
	codeVerifier, err := client.GenerateCodeVerifier()
	if err != nil {
		mc.LastError = fmt.Sprintf("failed to generate code verifier: %s", err)
		return fmt.Errorf("failed to generate code verifier: %w", err)
	}
	codeChallenge := client.GenerateCodeChallenge(codeVerifier)
	state, err := client.GenerateState()
	if err != nil {
		mc.LastError = fmt.Sprintf("failed to generate state: %s", err)
		return fmt.Errorf("failed to generate state: %w", err)
	}

	if err := oauthHandler.RegisterClient(ctx, "mcp-bouncer"); err != nil {
		mc.LastError = fmt.Sprintf("failed to register client: %s", err)
		return fmt.Errorf("failed to register client: %w", err)
	}

	authURL, err := oauthHandler.GetAuthorizationURL(ctx, state, codeChallenge)
	if err != nil {
		mc.LastError = fmt.Sprintf("failed to get authorization URL: %s", err)
		return fmt.Errorf("failed to get authorization URL: %w", err)
	}

	if err := openDefaultBrowser(authURL); err != nil {
		mc.LastError = fmt.Sprintf("failed to open browser automatically: %s", err)
		slog.Warn("Failed to open browser automatically", "error", err, "url", authURL)
	}

	// Wait for callback
	params := <-callbackChan
	if params["state"] != state {
		return fmt.Errorf("state mismatch: expected %s, got %s", state, params["state"])
	}
	code := params["code"]
	if code == "" {
		return fmt.Errorf("no authorization code received")
	}

	if err := oauthHandler.ProcessAuthorizationResponse(ctx, code, state, codeVerifier); err != nil {
		mc.LastError = fmt.Sprintf("failed to process authorization response: %s", err)
		return fmt.Errorf("failed to process authorization response: %w", err)
	}

	// Authorization succeeded; clear flag and attempt initialize on existing client
	cm.mutex.Lock()
	mc.AuthorizationRequired = false
	// Only mark as OAuth authenticated for streamable_http transport that requires auth
	if mc.Config.Transport == settings.TransportStreamableHTTP && mc.Config.RequiresAuth {
		mc.OAuthAuthenticated = true
	}
	mc.LastError = ""
	cm.mutex.Unlock()

	// Give token a moment to be recognized
	time.Sleep(200 * time.Millisecond)

	// Initialize and register tools without restarting the process
	if err := cm.initializeClient(ctx, mc); err != nil {
		mc.LastError = fmt.Sprintf("initializeClient: %s", err.Error())
		return fmt.Errorf("failed to initialize client after authorization: %w", err)
	}
	if err := cm.registerClientTools(ctx, mc); err != nil {
		mc.LastError = fmt.Sprintf("registerClientTools: %s", err.Error())
		return fmt.Errorf("failed to register tools after authorization: %w", err)
	}
	cm.mutex.Lock()
	mc.Connected = true
	cm.mutex.Unlock()

	// Notify UI
	cm.server.EmitEvent("mcp:client_status_changed", map[string]any{
		"server_name": name,
		"status":      "started",
	})
	return nil
}

// GetClientStatus returns the status of all clients
func (cm *ClientManager) GetClientStatus() map[string]ClientStatus {
	cm.mutex.RLock()
	defer cm.mutex.RUnlock()

	status := make(map[string]ClientStatus)
	for name, mc := range cm.clients {
		status[name] = ClientStatus{
			Name:                  name,
			Connected:             mc.Connected,
			Tools:                 len(mc.Tools),
			LastError:             mc.LastError,
			AuthorizationRequired: mc.AuthorizationRequired,
			OAuthAuthenticated:    mc.OAuthAuthenticated,
		}
	}
	return status
}

// startClientProcess starts the client process
func (cm *ClientManager) startClientProcess(mc *ManagedClient) error {
	switch mc.Config.Transport {
	case settings.TransportStdio:
		// Create stdio transport
		mc.Transport = transport.NewStdio(mc.Config.Command, []string{}, mc.Config.Args...)

	case settings.TransportSSE:
		// Create SSE transport
		if mc.Config.Endpoint == "" {
			return fmt.Errorf("endpoint is required for SSE transport")
		}

		var options []transport.ClientOption
		if mc.Config.Headers != nil {
			options = append(options, transport.WithHeaders(mc.Config.Headers))
		}

		sseTransport, err := transport.NewSSE(mc.Config.Endpoint, options...)
		if err != nil {
			return fmt.Errorf("failed to create SSE transport: %w", err)
		}
		mc.Transport = sseTransport

	case settings.TransportStreamableHTTP:
		// Create streamable HTTP client (OAuth or non-OAuth based on configuration)
		if mc.Config.Endpoint == "" {
			return fmt.Errorf("endpoint is required for streamable HTTP transport")
		}

		if mc.Config.RequiresAuth {
			// Use file-based token store for persistent OAuth tokens
			tokenStore := NewFileTokenStore(mc.Config.Name)
			slog.Debug("Creating OAuth client", "server_name", mc.Config.Name, "endpoint", mc.Config.Endpoint)
			oauthConfig := client.OAuthConfig{
				RedirectURI: "http://localhost:8085/oauth/callback",
				Scopes:      []string{"mcp.read", "mcp.write"},
				TokenStore:  tokenStore,
				PKCEEnabled: true,
			}
			oauthClient, err := client.NewOAuthStreamableHttpClient(mc.Config.Endpoint, oauthConfig)
			if err != nil {
				return fmt.Errorf("failed to create OAuth HTTP client: %w", err)
			}
			mc.Client = oauthClient
		} else {
			// Create non-OAuth streamable HTTP client
			slog.Debug("Creating non-OAuth streamable HTTP client", "server_name", mc.Config.Name, "endpoint", mc.Config.Endpoint)
			httpClient, err := client.NewStreamableHttpClient(mc.Config.Endpoint)
			if err != nil {
				return fmt.Errorf("failed to create HTTP client: %w", err)
			}
			mc.Client = httpClient
		}
		return nil

	default:
		return fmt.Errorf("unsupported transport type: %s", mc.Config.Transport)
	}

	return nil
}

// initializeClient initializes the MCP client
func (cm *ClientManager) initializeClient(ctx context.Context, mc *ManagedClient) error {
	initializeRequest := mcp.InitializeRequest{}
	initializeRequest.Params.ClientInfo.Name = "mcp-bouncer"
	initializeRequest.Params.ClientInfo.Version = "0.0.1"

	_, err := mc.Client.Initialize(ctx, initializeRequest)
	if err != nil {
		return fmt.Errorf("failed to initialize client: %w", err)
	}

	return nil
}

// registerClientTools registers tools from the client with the main server
func (cm *ClientManager) registerClientTools(ctx context.Context, mc *ManagedClient) error {
	listToolsResult, err := mc.Client.ListTools(ctx, mcp.ListToolsRequest{})
	if err != nil {
		return fmt.Errorf("failed to list tools: %w", err)
	}

	mc.Tools = listToolsResult.Tools

	// Register each tool with the main server
	for _, tool := range listToolsResult.Tools {
		// Create a proxy handler that forwards calls to the client
		handler := func(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			// Strip the prefix from the tool name for the client call
			request.Params.Name = tool.Name

			slog.Info("Calling tool",
				"client", mc.Config.Name,
				"original_tool", tool.Name,
				"prefixed_tool", request.Params.Name,
				"request", request)

			return mc.Client.CallTool(ctx, request)
		}

		// Add tool to main server with prefixed name to avoid conflicts
		prefixedName := fmt.Sprintf("%s:%s", mc.Config.Name, tool.Name)
		prefixedTool := mcp.Tool{
			Name:        prefixedName,
			Description: fmt.Sprintf("[%s] %s", mc.Config.Name, tool.Description),
			InputSchema: tool.InputSchema,
		}

		cm.server.mcp.AddTool(prefixedTool, handler)
		slog.Debug("Registered client tool", "client", mc.Config.Name, "tool", tool.Name, "prefixed_name", prefixedName)
	}

	return nil
}

// removeClientTools removes tools from the main server
func (cm *ClientManager) removeClientTools(mc *ManagedClient) {
	for _, tool := range mc.Tools {
		prefixedName := fmt.Sprintf("%s:%s", mc.Config.Name, tool.Name)
		cm.server.mcp.DeleteTools(prefixedName)
		slog.Debug("Removed client tool", "client", mc.Config.Name, "tool", tool.Name, "prefixed_name", prefixedName)
	}
	mc.Tools = nil
}

// monitorClient monitors the client for disconnections and restarts
func (cm *ClientManager) monitorClient(ctx context.Context, mc *ManagedClient) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-mc.StopChan:
			return
		case <-mc.RestartChan:
			slog.Info("Restarting client", "name", mc.Config.Name)
			if err := cm.RestartClient(ctx, mc.Config.Name); err != nil {
				slog.Error("Failed to restart client", "name", mc.Config.Name, "error", err)
			}
			return
		case <-ticker.C:
			// For now, we'll rely on the transport to handle process monitoring
			// The transport will close if the process exits, which will be detected
			// when we try to make calls to the client
		}
	}
}

// LoadClientsFromSettings loads and starts clients based on settings
func (cm *ClientManager) LoadClientsFromSettings(ctx context.Context, settings *settings.Settings) error {
	slog.Info("Starting to load clients from settings", "total_clients", len(settings.MCPServers))

	// Stop all existing clients
	cm.mutex.Lock()
	for name := range cm.clients {
		slog.Info("Stopping existing client", "name", name)
		cm.stopClientInternal(name)
	}
	cm.mutex.Unlock()

	// Start enabled clients
	for _, config := range settings.MCPServers {
		if config.Enabled {
			slog.Info("Starting enabled client", "name", config.Name, "command", config.Command)
			if err := cm.StartClient(ctx, config); err != nil {
				slog.Error("Failed to start client", "name", config.Name, "error", err)
				// Continue with other clients
			} else {
				slog.Info("Successfully started client", "name", config.Name)
			}
		} else {
			slog.Info("Skipping disabled client", "name", config.Name)
		}
	}

	slog.Info("Finished loading clients from settings")
	return nil
}

// StopAllClients stops all managed clients
func (cm *ClientManager) StopAllClients() {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	for name := range cm.clients {
		cm.stopClientInternal(name)
	}
}

// GetClientTools returns the tools for a specific client
func (cm *ClientManager) GetClientTools(clientName string) ([]mcp.Tool, error) {
	cm.mutex.RLock()
	defer cm.mutex.RUnlock()

	mc, exists := cm.clients[clientName]
	if !exists {
		return nil, fmt.Errorf("client '%s' not found", clientName)
	}

	if !mc.Connected {
		return nil, fmt.Errorf("client '%s' is not connected", clientName)
	}

	return mc.Tools, nil
}

// ToggleTool enables or disables a specific tool for a client
func (cm *ClientManager) ToggleTool(clientName string, toolName string, enabled bool) error {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	mc, exists := cm.clients[clientName]
	if !exists {
		return fmt.Errorf("client '%s' not found", clientName)
	}

	if !mc.Connected {
		return fmt.Errorf("client '%s' is not connected", clientName)
	}

	// Find the tool
	var targetTool *mcp.Tool
	for _, tool := range mc.Tools {
		if tool.Name == toolName {
			targetTool = &tool
			break
		}
	}

	if targetTool == nil {
		return fmt.Errorf("tool '%s' not found in client '%s'", toolName, clientName)
	}

	prefixedName := fmt.Sprintf("%s:%s", clientName, toolName)

	if enabled {
		// Re-register the tool
		handler := func(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			// Strip the prefix from the tool name for the client call
			request.Params.Name = toolName

			slog.Info("Calling tool",
				"client", mc.Config.Name,
				"original_tool", toolName,
				"prefixed_tool", request.Params.Name,
				"request", request)

			// Call the client with the original tool name
			return mc.Client.CallTool(ctx, request)
		}

		prefixedTool := mcp.Tool{
			Name:        prefixedName,
			Description: fmt.Sprintf("[%s] %s", mc.Config.Name, targetTool.Description),
			InputSchema: targetTool.InputSchema,
		}

		cm.server.mcp.AddTool(prefixedTool, handler)
		slog.Debug("Re-enabled client tool", "client", mc.Config.Name, "tool", toolName, "prefixed_name", prefixedName)
	} else {
		// Remove the tool
		cm.server.mcp.DeleteTools(prefixedName)
		slog.Debug("Disabled client tool", "client", mc.Config.Name, "tool", toolName, "prefixed_name", prefixedName)
	}

	return nil
}
