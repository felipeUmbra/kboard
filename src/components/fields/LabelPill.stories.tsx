import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { LabelPill } from './LabelPill';

const meta = {
  component: LabelPill,
  tags: ['ai-generated', 'needs-work'],
} satisfies Meta<typeof LabelPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: { id: 'label-1', name: 'Bug', color: '#c62828' },
  },
};

export const Feature: Story = {
  args: {
    label: { id: 'label-2', name: 'Feature', color: '#276b2b' },
  },
};

export const Warning: Story = {
  args: {
    label: { id: 'label-3', name: 'Warning', color: '#f57f17' },
  },
};

export const Compact: Story = {
  args: {
    label: { id: 'label-1', name: 'Bug', color: '#c62828' },
    compact: true,
  },
};

export const LongName: Story = {
  args: {
    label: { id: 'label-4', name: 'Very Long Label Name That Might Truncate', color: '#005b93' },
  },
};

export const MultipleLabels: Story = {
  args: {
    label: { id: '1', name: 'Bug', color: '#c62828' },
  },
  render: () => (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <LabelPill label={{ id: '1', name: 'Bug', color: '#c62828' }} />
      <LabelPill label={{ id: '2', name: 'Feature', color: '#276b2b' }} />
      <LabelPill label={{ id: '3', name: 'Enhancement', color: '#4a5769' }} />
      <LabelPill label={{ id: '4', name: 'Documentation', color: '#15703f' }} />
    </div>
  ),
};