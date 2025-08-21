import type { Preview } from '@storybook/react-vite';
import { DocsContainer } from '@storybook/addon-docs/blocks';
import '../src/style.css';
import { ThemeProvider } from '../src/components/ThemeProvider';

import { withThemeByClassName } from "@storybook/addon-themes";

const lightClasses = 'light bg-gray-100';
const darkClasses = 'dark bg-radial from-gray-800 via-gray-800 to-gray-900';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      container: (props: any) => {
        let theme = props?.context.store.userGlobals.globals.theme || 'light';
        let propsWithTheme = { ...props };
        return (
          <DocsContainer {...propsWithTheme} className={theme == 'light' ? lightClasses : darkClasses} />
        );
      }
    }
  },

  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
    withThemeByClassName({
      themes: {
        light: lightClasses,
        dark: darkClasses,
      },
      defaultTheme: 'light',
    })
  ]
};

export default preview;
