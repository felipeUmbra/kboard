import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Card } from './Card';
import type { Board, Card as CardModel, Column, CardTypeConfig } from '../models/types';

const meta = {
  component: Card,
  tags: ['ai-generated', 'needs-work'],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

const now = Date.now();

// Mock board and card data
const mockColumns: Column[] = [
  { id: 'col-1', name: 'To Do', cardIds: [] },
  { id: 'col-2', name: 'In Progress', cardIds: [] },
  { id: 'col-3', name: 'Done', cardIds: [] },
];

const mockCardTypes: CardTypeConfig[] = [
  { type: 'epic', enabled: true, label: 'Epic', customFields: [] },
  { type: 'story', enabled: true, label: 'Story', customFields: [] },
  { type: 'task', enabled: true, label: 'Task', customFields: [] },
];

const mockBoard: Board = {
  id: 'board-1',
  name: 'Test Board',
  columns: mockColumns,
  labels: [
    { id: 'label-1', name: 'Bug', color: '#c62828' },
    { id: 'label-2', name: 'Feature', color: '#276b2b' },
  ],
  customFields: [],
  cardTypes: mockCardTypes,
  doneColumnIds: ['col-3'],
  createdAt: now,
  updatedAt: now,
  cards: {},
};

const mockCard: CardModel = {
  id: 'card-1',
  title: 'Sample Task',
  descriptionHtml: '<p>This is a sample task card with a description.</p>',
  type: 'task',
  labelIds: ['label-1'],
  boardFieldValues: {},
  typeFieldValues: {},
  parentIds: [],
  checklists: [],
  startDate: null,
  dueDate: null,
  activity: [],
  comments: [],
  createdAt: now,
  updatedAt: now,
};

export const Default: Story = {
  args: {
    card: mockCard,
    board: mockBoard,
    onOpen: () => console.log('Card opened'),
  },
};

export const EpicCard: Story = {
  args: {
    card: {
      ...mockCard,
      id: 'card-epic',
      title: 'Build Authentication System',
      type: 'epic',
      descriptionHtml: '<p>Implement user authentication with OAuth providers.</p>',
    },
    board: mockBoard,
    onOpen: () => console.log('Epic opened'),
  },
};

export const StoryCard: Story = {
  args: {
    card: {
      ...mockCard,
      id: 'card-story',
      title: 'Add Google OAuth',
      type: 'story',
      parentIds: ['card-epic'],
      descriptionHtml: '<p>Integrate Google Sign-In for seamless authentication.</p>',
    },
    board: mockBoard,
    onOpen: () => console.log('Story opened'),
  },
};

export const WithLabels: Story = {
  args: {
    card: {
      ...mockCard,
      id: 'card-labeled',
      title: 'Card with Multiple Labels',
      labelIds: ['label-1', 'label-2'],
    },
    board: mockBoard,
    onOpen: () => console.log('Labeled card opened'),
  },
};

export const WithDescription: Story = {
  args: {
    card: {
      ...mockCard,
      id: 'card-described',
      title: 'Card with Long Description',
      descriptionHtml: '<p>This card has a longer description that should be truncated in the preview.</p><p>It includes multiple paragraphs and <strong>formatting</strong> to test the preview truncation logic.</p>',
    },
    board: mockBoard,
    onOpen: () => console.log('Described card opened'),
  },
};

export const WithChecklist: Story = {
  args: {
    card: {
      ...mockCard,
      id: 'card-checklist',
      title: 'Task with Checklist',
      checklists: [
        {
          id: 'cl-1',
          title: 'Subtasks',
          items: [
            { id: 'item-1', text: 'Design API', done: true },
            { id: 'item-2', text: 'Implement backend', done: false },
            { id: 'item-3', text: 'Write tests', done: false },
          ],
        },
      ],
    },
    board: mockBoard,
    onOpen: () => console.log('Checklist card opened'),
  },
};

export const WithParent: Story = {
  args: {
    card: {
      ...mockCard,
      id: 'card-child',
      title: 'Child Task',
      type: 'task',
      parentIds: ['card-epic', 'card-story'],
    },
    board: {
      ...mockBoard,
      cards: {
        'card-epic': {
          id: 'card-epic',
          title: 'Parent Epic',
          descriptionHtml: '',
          type: 'epic',
          labelIds: [],
          boardFieldValues: {},
          typeFieldValues: {},
          parentIds: [],
          checklists: [],
          startDate: null,
          dueDate: null,
          activity: [],
          comments: [],
          createdAt: now,
          updatedAt: now,
        },
        'card-story': {
          id: 'card-story',
          title: 'Parent Story',
          descriptionHtml: '',
          type: 'story',
          labelIds: [],
          boardFieldValues: {},
          typeFieldValues: {},
          parentIds: [],
          checklists: [],
          startDate: null,
          dueDate: null,
          activity: [],
          comments: [],
          createdAt: now,
          updatedAt: now,
        },
      },
    },
    onOpen: () => console.log('Child card opened'),
  },
};

// CssCheck story to verify global CSS loaded correctly
export const CssCheck: Story = {
  args: {
    card: mockCard,
    board: mockBoard,
    onOpen: () => console.log('Card opened'),
  },
  play: async ({ canvas }) => {
    const cardElement = canvas.getByRole('button', { name: /sample task/i });
    // Card uses border-left with meta.color which for task is #4a5769
    await expect(getComputedStyle(cardElement).borderLeftColor).toBe('rgb(74, 87, 105)');
  },
};