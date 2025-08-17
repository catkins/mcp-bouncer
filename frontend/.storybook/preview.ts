import type { Preview } from '@storybook/react-vite';
import '../src/style.css';

import { withThemeByClassName } from "@storybook/addon-themes";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },

  decorators: [withThemeByClassName({
    themes: {
      light: 'light bg-gray-100',
      dark: 'dark bg-radial from-gray-800 via-gray-800 to-gray-900',
    },
    defaultTheme: 'light',
  })]
};

export default preview;
