import type { Meta, StoryObj } from '@storybook/react';
import { ToolsModal } from './ToolsModal';
import { useState, useEffect } from 'react';

// Mock the MCPService for Storybook
const mockMCPService = {
  GetClientTools: async (serverName: string) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    const toolsData = {
      'fetch': [
        {
          name: 'fetch_url',
          description: 'Fetch content from a URL',
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL to fetch' },
              method: { type: 'string', enum: ['GET', 'POST'], default: 'GET' }
            }
          }
        },
        {
          name: 'download_file',
          description: 'Download a file from a URL',
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL to download from' },
              filename: { type: 'string', description: 'Local filename to save as' }
            }
          }
        },
        {
          name: 'parse_html',
          description: 'Parse HTML content and extract specific elements',
          inputSchema: {
            type: 'object',
            properties: {
              html: { type: 'string', description: 'HTML content to parse' },
              selector: { type: 'string', description: 'CSS selector to extract' }
            }
          }
        }
      ],
      'buildkite': [
        {
          name: 'list_pipelines',
          description: 'List all pipelines in the organization',
          inputSchema: {
            type: 'object',
            properties: {
              org_slug: { type: 'string', description: 'Organization slug' }
            }
          }
        },
        {
          name: 'get_build',
          description: 'Get details about a specific build',
          inputSchema: {
            type: 'object',
            properties: {
              org_slug: { type: 'string', description: 'Organization slug' },
              pipeline_slug: { type: 'string', description: 'Pipeline slug' },
              build_number: { type: 'string', description: 'Build number' }
            }
          }
        },
        {
          name: 'create_build',
          description: 'Trigger a new build',
          inputSchema: {
            type: 'object',
            properties: {
              org_slug: { type: 'string', description: 'Organization slug' },
              pipeline_slug: { type: 'string', description: 'Pipeline slug' },
              commit: { type: 'string', description: 'Commit SHA' },
              branch: { type: 'string', description: 'Branch name' }
            }
          }
        },
        {
          name: 'list_builds',
          description: 'List builds for a pipeline',
          inputSchema: {
            type: 'object',
            properties: {
              org_slug: { type: 'string', description: 'Organization slug' },
              pipeline_slug: { type: 'string', description: 'Pipeline slug' }
            }
          }
        }
      ],
      'context7': [
        {
          name: 'search_context',
          description: 'Search through context data',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              limit: { type: 'number', description: 'Maximum results to return' }
            }
          }
        },
        {
          name: 'get_context',
          description: 'Get context by ID',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Context ID' }
            }
          }
        }
      ],
      'empty-server': []
    };

    if (serverName === 'error-server') {
      throw new Error('Failed to load tools: Server not responding');
    }

    return toolsData[serverName as keyof typeof toolsData] || [];
  },

  ToggleTool: async (serverName: string, toolName: string, enabled: boolean) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    if (toolName === 'error-tool') {
      throw new Error('Failed to toggle tool: Permission denied');
    }

    return { success: true };
  }
};

// Mock the service module for Storybook
declare global {
  interface Window {
    MCPService: any;
  }
}

// Set up the mock service
if (typeof window !== 'undefined') {
  (window as any).MCPService = mockMCPService;
}

const meta: Meta<typeof ToolsModal> = {
  title: 'Components/ToolsModal',
  component: ToolsModal,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'dark-overlay',
      values: [
        { name: 'dark-overlay', value: 'rgba(0, 0, 0, 0.5)' },
        { name: 'light-overlay', value: 'rgba(255, 255, 255, 0.8)' },
      ],
    },
  },
  tags: ['autodocs'],
  args: {
    serverName: 'fetch',
    isOpen: true,
  },
  argTypes: {
    onClose: { action: 'closed' },
    isOpen: {
      control: { type: 'boolean' },
      description: 'Whether the modal is open',
    },
    serverName: {
      control: { type: 'select' },
      options: ['fetch', 'buildkite', 'context7', 'empty-server', 'error-server'],
      description: 'Server name to load tools for',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    serverName: 'fetch',
    isOpen: true,
  },
};

export const FetchServer: Story = {
  args: {
    serverName: 'fetch',
    isOpen: true,
  },
};

export const BuildkiteServer: Story = {
  args: {
    serverName: 'buildkite',
    isOpen: true,
  },
};

export const Context7Server: Story = {
  args: {
    serverName: 'context7',
    isOpen: true,
  },
};

export const EmptyServer: Story = {
  args: {
    serverName: 'empty-server',
    isOpen: true,
  },
};

export const ErrorServer: Story = {
  args: {
    serverName: 'error-server',
    isOpen: true,
  },
};

export const Closed: Story = {
  args: {
    serverName: 'fetch',
    isOpen: false,
  },
};

// Interactive example that manages its own state
export const Interactive = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [serverName, setServerName] = useState('fetch');

  return (
    <div className="p-8">
      <div className="space-y-4 mb-8">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Server:
          </label>
          <select
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md bg-white"
          >
            <option value="fetch">Fetch Server (3 tools)</option>
            <option value="buildkite">Buildkite Server (4 tools)</option>
            <option value="context7">Context7 Server (2 tools)</option>
            <option value="empty-server">Empty Server (0 tools)</option>
            <option value="error-server">Error Server</option>
          </select>
        </div>
        <button
          onClick={() => setIsOpen(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Open Tools Modal
        </button>
      </div>

      <ToolsModal
        serverName={serverName}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
};

Interactive.parameters = {
  layout: 'fullscreen',
  backgrounds: { default: 'light-overlay' },
};

// Example showing loading state
export const LoadingState = () => {
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    // Override the mock to simulate slower loading
    const slowMockService = {
      ...mockMCPService,
      GetClientTools: async (serverName: string) => {
        await new Promise(resolve => setTimeout(resolve, 3000));
        return mockMCPService.GetClientTools(serverName);
      }
    };

    if (typeof window !== 'undefined') {
      (window as any).MCPService = slowMockService;
    }
  }, []);

  return (
    <div className="p-8">
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 mb-4"
      >
        Open Slow Loading Modal
      </button>

      <ToolsModal
        serverName="fetch"
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
};

LoadingState.parameters = {
  layout: 'fullscreen',
  backgrounds: { default: 'light-overlay' },
};

// Dark theme example
export const DarkTheme: Story = {
  args: {
    serverName: 'buildkite',
    isOpen: true,
  },
  parameters: {
    backgrounds: { default: 'dark-overlay' },
    theme: 'dark',
  },
};

// Example with many tools to test scrolling
export const ManyTools = () => {
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    // Override mock to return many tools
    const manyToolsService = {
      ...mockMCPService,
      GetClientTools: async (serverName: string) => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return Array.from({ length: 25 }, (_, i) => ({
          name: `tool_${i + 1}`,
          description: `This is tool number ${i + 1}. It performs various operations and has a longer description to test the layout with more content.`,
          inputSchema: {
            type: 'object',
            properties: {
              param1: { type: 'string', description: 'First parameter' },
              param2: { type: 'string', description: 'Second parameter' },
            }
          }
        }));
      }
    };

    if (typeof window !== 'undefined') {
      (window as any).MCPService = manyToolsService;
    }
  }, []);

  return (
    <div className="p-8">
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 mb-4"
      >
        Open Modal with Many Tools
      </button>

      <ToolsModal
        serverName="many-tools"
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
};

ManyTools.parameters = {
  layout: 'fullscreen',
  backgrounds: { default: 'light-overlay' },
};
