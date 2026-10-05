import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Modal } from './Modal';

const meta = {
  component: Modal,
  tags: ['ai-generated', 'needs-work'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    onClose: { action: 'close' },
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Small: Story = {
  args: {
    title: 'Small Modal',
    size: 'sm',
    children: <p>This is a small modal with some content.</p>,
    footer: (
      <button type="button" className="btn btn--primary">Confirm</button>
    ),
    onClose: () => {},
  },
};

export const Medium: Story = {
  args: {
    title: 'Medium Modal',
    size: 'md',
    children: <p>This is a medium modal with more content. You can put forms, lists, or any other content here.</p>,
    footer: (
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn--ghost">Cancel</button>
        <button type="button" className="btn btn--primary">Save</button>
      </div>
    ),
    onClose: () => {},
  },
};

export const Large: Story = {
  args: {
    title: 'Large Modal',
    size: 'lg',
    children: (
      <div>
        <p>This is a large modal suitable for complex forms or detailed views.</p>
        <p>It can contain multiple paragraphs, forms, tables, or any other content.</p>
      </div>
    ),
    footer: (
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn--ghost">Cancel</button>
        <button type="button" className="btn btn--danger">Delete</button>
        <button type="button" className="btn btn--primary">Save Changes</button>
      </div>
    ),
    onClose: () => {},
  },
};

export const WithoutFooter: Story = {
  args: {
    title: 'Modal Without Footer',
    children: <p>This modal has no footer actions.</p>,
    onClose: () => {},
  },
};

export const WithForm: Story = {
  args: {
    title: 'Modal with Form',
    size: 'md',
    children: (
      <form style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label htmlFor="name" style={{ display: 'block', marginBottom: '4px' }}>
            Name
          </label>
          <input
            id="name"
            type="text"
            className="input"
            placeholder="Enter your name"
          />
        </div>
        <div>
          <label htmlFor="email" style={{ display: 'block', marginBottom: '4px' }}>
            Email
          </label>
          <input
            id="email"
            type="email"
            className="input"
            placeholder="Enter your email"
          />
        </div>
      </form>
    ),
    footer: (
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn--ghost">Cancel</button>
        <button type="submit" className="btn btn--primary">Submit</button>
      </div>
    ),
    onClose: () => {},
  },
};