package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/adrg/xdg"
	"github.com/catkins/mcp-bouncer/pkg/services/settings"
	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/client/transport"
	"github.com/mark3labs/mcp-go/mcp"
)

// FileTokenStore implements transport.TokenStore by persisting tokens to disk.
// It stores OAuth tokens in JSON format with secure file permissions (0600).
// Tokens are stored per-server using unique filenames in the user's config directory.
// Thread-safe operations are provided through mutex protection.
type FileTokenStore struct {
	filePath string
	mutex    sync.RWMutex
}

// NewFileTokenStore creates a new file-based token store using the default location
func NewFileTokenStore(serverName string) *FileTokenStore {
	// Create a unique filename based on server name
	filename := fmt.Sprintf("mcp-tokens-%s.json", serverName)
	filePath := filepath.Join(xdg.ConfigHome, "mcp-bouncer", filename)

	return NewFileTokenStoreWithPath(filePath)
}

// NewFileTokenStoreWithPath creates a new file-based token store with a custom file path
func NewFileTokenStoreWithPath(filePath string) *FileTokenStore {
	// Ensure the directory exists
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		slog.Warn("Failed to create token storage directory", "error", err, "path", filepath.Dir(filePath))
	}

	return &FileTokenStore{
		filePath: filePath,
	}
}

// GetToken retrieves a token from the file
func (f *FileTokenStore) GetToken() (*transport.Token, error) {
	f.mutex.RLock()
	defer f.mutex.RUnlock()

	slog.Debug("FileTokenStore: GetToken called", "path", f.filePath)

	// Check if file exists
	if _, err := os.Stat(f.filePath); os.IsNotExist(err) {
		// Follow MemoryTokenStore pattern: return error when no token available
		slog.Debug("FileTokenStore: no token file found", "path", f.filePath)
		return nil, fmt.Errorf("no token available")
	}

	// Read the file
	data, err := os.ReadFile(f.filePath)
	if err != nil {
		slog.Error("FileTokenStore: failed to read token file", "path", f.filePath, "error", err)
		return nil, fmt.Errorf("failed to read token file: %w", err)
	}

	// Parse JSON
	var token transport.Token
	if err := json.Unmarshal(data, &token); err != nil {
		slog.Error("FileTokenStore: failed to parse token file", "path", f.filePath, "error", err)
		return nil, fmt.Errorf("failed to parse token file: %w", err)
	}

	slog.Debug("FileTokenStore: successfully loaded token", "path", f.filePath, "expires_at", token.ExpiresAt)
	return &token, nil
}

// SaveToken saves a token to the file
func (f *FileTokenStore) SaveToken(token *transport.Token) error {
	f.mutex.Lock()
	defer f.mutex.Unlock()

	// Marshal token to JSON
	data, err := json.MarshalIndent(token, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal token: %w", err)
	}

	// Write to file with proper permissions
	if err := os.WriteFile(f.filePath, data, 0600); err != nil {
		return fmt.Errorf("failed to write token file: %w", err)
	}

	slog.Debug("Token saved to file", "path", f.filePath)
	return nil
}

// ClearToken removes the stored token file
func (f *FileTokenStore) ClearToken() error {
	f.mutex.Lock()
	defer f.mutex.Unlock()

	if err := os.Remove(f.filePath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove token file: %w", err)
	}

	slog.Debug("Token file cleared", "path", f.filePath)
	return nil
}

// GetTokenFilePath returns the path to the token file (for debugging/info purposes)
func (f *FileTokenStore) GetTokenFilePath() string {
	return f.filePath
}

// ClientManager manages MCP client connections
type ClientManager struct {
	clients map[string]*ManagedClient
	mutex   sync.RWMutex
	server  *Server
}

// OAuth tokens are persisted to disk using FileTokenStore for session recovery

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
			mc.LastError = fmt.Sprintf("cm.initializeClient: %s", err.Error())
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

	// Register tools with the main server
	if err := cm.registerClientTools(ctx, mc); err != nil {
		cm.stopClientInternal(config.Name)
		return fmt.Errorf("failed to register client tools: %w", err)
	}

	mc.Connected = true
	cm.clients[config.Name] = mc

	// Start monitoring goroutine
	go cm.monitorClient(ctx, mc)

	slog.Info("Started MCP client", "name", config.Name, "tools", len(mc.Tools))
	// Emit per-client started event for immediate UI update
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

	// Signal stop
	close(mc.StopChan)

	// Remove tools from main server
	cm.removeClientTools(mc)

	// Close transport with timeout to prevent hanging
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

	// Remove from clients map
	delete(cm.clients, name)

	slog.Info("Stopped MCP client", "name", name)
	// Emit per-client stopped event for immediate UI update
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

	// Stop the client
	if err := cm.StopClient(name); err != nil {
		return fmt.Errorf("failed to stop client: %w", err)
	}

	// Wait a bit before restarting
	time.Sleep(1 * time.Second)

	// Start the client again
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

	// Check if the server is configured to require authorization
	if !mc.Config.RequiresAuth {
		return fmt.Errorf("server '%s' is not configured to require authorization", name)
	}

	// Try an initialize call to retrieve the OAuth handler from the error
	_, err := mc.Client.Initialize(ctx, mcp.InitializeRequest{})
	if err == nil {
		return nil
	}

	if !client.IsOAuthAuthorizationRequiredError(err) {
		return fmt.Errorf("authorization not required or unexpected error: %w", err)
	}

	oauthHandler := client.GetOAuthHandler(err)
	if oauthHandler == nil {
		return fmt.Errorf("failed to obtain OAuth handler")
	}

	// Start callback server
	callbackChan := make(chan map[string]string)
	srv := startOAuthCallbackServer(callbackChan)
	defer srv.Close()

	// PKCE and state
	codeVerifier, err := client.GenerateCodeVerifier()
	if err != nil {
		return fmt.Errorf("failed to generate code verifier: %w", err)
	}
	codeChallenge := client.GenerateCodeChallenge(codeVerifier)
	state, err := client.GenerateState()
	if err != nil {
		return fmt.Errorf("failed to generate state: %w", err)
	}

	if err := oauthHandler.RegisterClient(ctx, "mcp-bouncer"); err != nil {
		return fmt.Errorf("failed to register client: %w", err)
	}

	authURL, err := oauthHandler.GetAuthorizationURL(ctx, state, codeChallenge)
	if err != nil {
		return fmt.Errorf("failed to get authorization URL: %w", err)
	}

	if err := openDefaultBrowser(authURL); err != nil {
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

// startOAuthCallbackServer starts a local HTTP server for OAuth redirect handling
func startOAuthCallbackServer(callbackChan chan<- map[string]string) *http.Server {
	server := &http.Server{Addr: ":8085"}
	mux := http.NewServeMux()
	mux.HandleFunc("/oauth/callback", func(w http.ResponseWriter, r *http.Request) {
		params := make(map[string]string)
		for key, values := range r.URL.Query() {
			if len(values) > 0 {
				params[key] = values[0]
			}
		}
		callbackChan <- params
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`
      <html>
        <body>
          <h1>Authorization Successful</h1>
          <p>You can now close this window and return to the application.</p>
          <script>window.close();</script>
        </body>
      </html>
    `))
	})
	server.Handler = mux

	go func() {
		if err := server.ListenAndServe(); err != nil && err.Error() != "http: Server closed" {
			slog.Error("OAuth callback server error", "error", err)
		}
	}()

	return server
}

// openDefaultBrowser opens the system browser to a URL
func openDefaultBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Start()
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

// ClientStatus represents the status of a client
type ClientStatus struct {
	Name                  string `json:"name"`
	Connected             bool   `json:"connected"`
	Tools                 int    `json:"tools"`
	LastError             string `json:"last_error,omitempty"`
	AuthorizationRequired bool   `json:"authorization_required"`
	OAuthAuthenticated    bool   `json:"oauth_authenticated"`
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
			// tokenStore := NewFileTokenStore(mc.Config.Name)
			tokenStore := client.NewMemoryTokenStore()
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

			// Call the client with the original tool name
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
