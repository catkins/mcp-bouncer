# Components & Storybook

This directory contains all the React components for the MCP Bouncer frontend, along with comprehensive Storybook stories for development and testing.

## Components

### Core Components

- **Header** - Application header with theme toggle and server status
- **StatusIndicator** - Shows server connection status (active/inactive/checking)
- **LoadingButton** - Button with loading states and multiple variants
- **ToggleSwitch** - Customizable toggle switch with labels and descriptions
- **Toast/ToastContainer** - Toast notifications with multiple types (success, error, warning, info)

### Server Management

- **ServerCard** - Displays individual server configuration and status
- **ServerForm** - Modal form for adding/editing server configurations
- **ServerList** - Main container for managing multiple servers
- **ToolsModal** - Modal for viewing and managing server tools

## Storybook

All components include comprehensive Storybook stories for:

- **Visual Testing** - See components in all states and variants
- **Interactive Development** - Test component behavior and interactions
- **Documentation** - Auto-generated docs with prop descriptions
- **Accessibility Testing** - Test components with different themes and states

### Running Storybook

```bash
# Development server
npm run storybook

# Build static version
npm run build-storybook
```

### Story Organization

Stories are organized by component and include:

- **Default states** - Basic component usage
- **Variants** - Different visual styles and sizes
- **States** - Loading, error, disabled states
- **Interactive examples** - Complex scenarios with state management
- **Edge cases** - Long text, empty states, error conditions
- **Theming** - Light and dark theme variations

### Story Patterns

Each component follows these story patterns:

1. **Basic Examples** - Default, primary use cases
2. **Variants** - Visual variations (colors, sizes, styles)
3. **States** - Loading, disabled, error states
4. **Interactive** - Stories with user interaction
5. **Edge Cases** - Boundary conditions and error scenarios
6. **Theming** - Light/dark theme examples

### Mock Data

Stories use mock data and services to simulate real application behavior:

- **MCPServerConfig** - Mock server configurations for different transport types
- **ClientStatus** - Mock connection statuses and tool counts
- **MCPService** - Mocked service calls with realistic delays and errors

### Development Workflow

1. **Create Component** - Build new component with TypeScript
2. **Add Stories** - Create comprehensive stories covering all use cases
3. **Test Interactions** - Use Storybook's interactive controls
4. **Document Props** - Ensure all props have proper TypeScript types
5. **Theme Testing** - Test components in light and dark themes

### Accessibility

All components are built with accessibility in mind:

- **Keyboard Navigation** - Full keyboard support
- **Screen Reader Support** - Proper ARIA labels and descriptions
- **Focus Management** - Visible focus indicators
- **Color Contrast** - Proper contrast ratios for all themes

### Best Practices

- **Component Props** - Use TypeScript interfaces for all props
- **Story Args** - Provide sensible defaults for all story arguments
- **Controls** - Use appropriate controls (select, boolean, text) for each prop
- **Actions** - Log all user interactions for testing
- **Backgrounds** - Test components on different background colors
- **Responsive** - Ensure components work at different screen sizes
