package mcp

import (
	"context"
	"fmt"
	"math/rand"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type MCPService struct {
	listenAddr string
	callback   func(e *application.CustomEvent)
	server     *Server
}

const defaultListenAddr = "localhost:8091"

func NewMCPService() *MCPService {
	return &MCPService{
		listenAddr: defaultListenAddr,
		server:     NewServer(defaultListenAddr),
	}
}

func (s *MCPService) Start(ctx context.Context) error {
	go func() {
		s.server.Start(ctx)
	}()
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

func (s *MCPService) List() ([]string, error) {
	servers := []string{}
	for i := range rand.Intn(10) {
		servers = append(servers, fmt.Sprintf("service%d", i+1))
	}
	return servers, nil
}

func (s *MCPService) ListenAddr() string {
	return fmt.Sprintf("http://%s/mcp", s.listenAddr)
}

func (s *MCPService) emitEvent(name string, data any) {
	s.callback(&application.CustomEvent{
		Name:   name,
		Data:   data,
		Sender: "mcp_service",
	})
}
