import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { TypeChip } from './TypeChip';

const meta = {
  component: TypeChip,
  tags: ['ai-generated', 'needs-work'],
  argTypes: {
    type: {
      control: 'select',
      options: ['epic', 'story', 'task'],
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md'],
    },
  },
} satisfies Meta<typeof TypeChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Epic: Story = {
  args: {
    type: 'epic',
    showLabel: true,
  },
};

export const Story: Story = {
  args: {
    type: 'story',
    showLabel: true,
  },
};

export const Task: Story = {
  args: {
    type: 'task',
    showLabel: true,
  },
};

export const EpicSmall: Story = {
  args: {
    type: 'epic',
    size: 'xs',
    showLabel: true,
  },
};

export const EpicLarge: Story = {
  args: {
    type: 'epic',
    size: 'md',
    showLabel: true,
  },
};

export const CustomLabel: Story = {
  args: {
    type: 'epic',
    customLabel: 'Initiative',
    showLabel: true,
  },
};

export const WithoutLabel: Story = {
  args: {
    type: 'story',
    showLabel: false,
  },
};

// CssCheck story to verify global CSS loaded correctly
export const CssCheck: Story = {
  args: {
    type: 'epic',
    showLabel: true,
  },
  play: async ({ canvas }) => {
    const chip = canvas.getByText('Epic');
    // TypeChip uses the CSS variable --color-type-epic for text color
    // which resolves to #7b3fb0 (rgb(123, 63, 176))
    await expect(getComputedStyle(chip).color).toBe('rgb(123, 63, 176)');
  },
};