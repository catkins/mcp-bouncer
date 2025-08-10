package mcp

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func NewServer(listenAddr string) *Server {
	mcpServer := server.NewMCPServer("mcp-bouncer", "0.0.1")
	mcpServer.AddTool(mcp.Tool{
		Name: "hello",
	}, func(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return mcp.NewToolResultText(fmt.Sprintf("hello: %s", time.Now().UTC().Format(time.RFC1123Z))), nil
	})
	streamableHttp := server.NewStreamableHTTPServer(mcpServer)
	mux := http.NewServeMux()
	mux.Handle("/mcp", streamableHttp)

	httpServer := &http.Server{
		Addr:    listenAddr,
		Handler: mux,
	}
	return &Server{
		listenAddr: listenAddr,
		mcp:        mcpServer,
		httpServer: httpServer,
	}
}

type Server struct {
	listenAddr string
	mcp        *server.MCPServer
	httpServer *http.Server
	active     bool
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
