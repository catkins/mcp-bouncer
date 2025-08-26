package mcp

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func NewServer(listenAddr string) *Server {
	hooks := &server.Hooks{}

	mcpServer := server.NewMCPServer("mcp-bouncer", "0.0.1",
		server.WithToolCapabilities(true),
		server.WithHooks(hooks))
	streamableHttp := server.NewStreamableHTTPServer(mcpServer)
	mux := http.NewServeMux()
	mux.Handle("/mcp", streamableHttp)

	httpServer := &http.Server{
		Addr:    listenAddr,
		Handler: mux,
	}

	srv := &Server{
		listenAddr: listenAddr,
		mcp:        mcpServer,
		httpServer: httpServer,
	}

	srv.incomingClients = NewIncomingClientRegistry(srv)

	hooks.AddAfterInitialize(srv.handleAfterInitialize)
	hooks.AddOnUnregisterSession(srv.handleUnregisterSession)

	srv.clientManager = NewClientManager(srv)

	return srv
}

type Server struct {
	listenAddr      string
	mcp             *server.MCPServer
	httpServer      *http.Server
	active          bool
	clientManager   *ClientManager
	eventEmitter    func(name string, data any)
	incomingClients *IncomingClientRegistry
}

func (s *Server) Start(ctx context.Context) error {
	errCh := make(chan error)
	go func() {
		s.active = true
		errCh <- s.httpServer.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second*5)
		defer cancel()
		return s.httpServer.Shutdown(shutdownCtx)
	}
}

// GetClientManager returns the client manager
func (s *Server) GetClientManager() *ClientManager {
	return s.clientManager
}

func (s *Server) GetIncomingClients() []IncomingClient {
	if s.incomingClients == nil {
		return []IncomingClient{}
	}
	return s.incomingClients.List()
}

// SetEventEmitter sets a callback to emit events to the application layer
func (s *Server) SetEventEmitter(emitter func(name string, data any)) {
	s.eventEmitter = emitter
}

// EmitEvent emits an event if an emitter is configured
func (s *Server) EmitEvent(name string, data any) {
	if s.eventEmitter != nil {
		s.eventEmitter(name, data)
	}
}

// handleAfterInitialize handles the after initialize hook
func (s *Server) handleAfterInitialize(ctx context.Context, id any, req *mcp.InitializeRequest, _ *mcp.InitializeResult) {
	session := server.ClientSessionFromContext(ctx)
	if session == nil {
		return
	}
	s.incomingClients.AddOrUpdate(session.SessionID(), req.Params.ClientInfo.Name, req.Params.ClientInfo.Version, "")
	s.EmitEvent(EventIncomingClientConnected, map[string]any{
		"id":           session.SessionID(),
		"name":         req.Params.ClientInfo.Name,
		"version":      req.Params.ClientInfo.Version,
		"title":        "",
		"connected_at": time.Now(),
	})
	s.EmitEvent(EventIncomingClientsUpdated, s.incomingClients.List())
}

// handleUnregisterSession handles the unregister session hook
func (s *Server) handleUnregisterSession(ctx context.Context, session server.ClientSession) {
	id := session.SessionID()
	if s.incomingClients.Remove(id) {
		s.EmitEvent(EventIncomingClientDisconnected, map[string]any{
			"id": id,
		})
		s.EmitEvent(EventIncomingClientsUpdated, s.incomingClients.List())
	} else {
		slog.Debug("UnregisterSession for unknown incoming client", "session_id", id)
	}
}
