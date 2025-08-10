package mcp

import (
	"context"
	"net/http"
	"time"

	"github.com/mark3labs/mcp-go/server"
)

func NewServer(listenAddr string) *Server {
	mcpServer := server.NewMCPServer("mcp-bouncer", "0.0.1",
		server.WithToolCapabilities(true))
	streamableHttp := server.NewStreamableHTTPServer(mcpServer)
	mux := http.NewServeMux()
	mux.Handle("/mcp", streamableHttp)

	httpServer := &http.Server{
		Addr:    listenAddr,
		Handler: mux,
	}

	server := &Server{
		listenAddr: listenAddr,
		mcp:        mcpServer,
		httpServer: httpServer,
	}

	// Create client manager
	server.clientManager = NewClientManager(server)

	return server
}

type Server struct {
	listenAddr    string
	mcp           *server.MCPServer
	httpServer    *http.Server
	active        bool
	clientManager *ClientManager
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
