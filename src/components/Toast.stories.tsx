import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Toast, useToast } from './Toast';

const meta = {
  component: Toast,
  tags: ['ai-generated', 'needs-work'],
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    toast: { id: 1, text: 'Card created successfully!' },
    onDismiss: () => console.log('Dismissed'),
  },
};

export const WithAction: Story = {
  args: {
    toast: {
      id: 2,
      text: 'Card created but hidden by current filters',
      action: {
        label: 'Clear filters',
        onAction: () => console.log('Clear filters clicked'),
      },
    },
    onDismiss: () => console.log('Dismissed'),
  },
};

export const LongMessage: Story = {
  args: {
    toast: {
      id: 3,
      text: 'This is a very long toast message that should wrap to multiple lines and test the layout when the text exceeds the available width.',
    },
    onDismiss: () => console.log('Dismissed'),
  },
};

// Story for the useToast hook
export const UseToastHook: Story = {
  args: {
    toast: { id: 1, text: 'Sample toast from hook' },
    onDismiss: () => console.log('Dismissed'),
  },
  render: ({ toast, onDismiss }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button 
          type="button" 
          className="btn btn--primary"
          onClick={() => console.log('Simple toast notification')}
        >
          Show Simple Toast
        </button>
        <button 
          type="button" 
          className="btn btn--primary"
          onClick={() => console.log('Toast with action')}
        >
          Show Toast with Action
        </button>
      </div>
      {toast && <Toast toast={toast} onDismiss={onDismiss} />}
    </div>
  ),
};