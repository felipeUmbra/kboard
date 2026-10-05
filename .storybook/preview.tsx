import type { Preview } from '@storybook/react-vite';
import MockDate from 'mockdate';
import { mswLoader } from 'msw-storybook-addon/csf3';
import { mswHandlers } from './msw-handlers';
import { AuthProvider } from '../src/auth/useAuth';
import { BoardProvider } from '../src/state/BoardContext';
import '../src/styles/tokens.css';
import '../src/styles/global.css';
import '../src/styles/components.css';
import '../src/styles/responsive.css';

// Create portal roots for modals
const portalIds = ['modal-root', 'drawer-root', 'toast-root'];

const preview: Preview = {
  decorators: [
    // Create portal roots
    (Story) => {
      if (typeof document !== 'undefined') {
        for (const id of portalIds) {
          if (!document.getElementById(id)) {
            const el = document.createElement('div');
            el.id = id;
            document.body.appendChild(el);
          }
        }
      }
      return <Story />;
    },
    // Wrap with providers
    (Story) => (
      <AuthProvider>
        <BoardProvider>
          <Story />
        </BoardProvider>
      </AuthProvider>
    ),
  ],
  loaders: [mswLoader()],
  async beforeEach({ msw }) {
    msw.use(...mswHandlers);
    localStorage.setItem('theme', 'dark');
    MockDate.set('2024-04-01T12:00:00Z');
  },
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;