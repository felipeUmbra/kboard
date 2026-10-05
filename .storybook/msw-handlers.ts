// MSW handlers for Storybook
import { http, HttpResponse } from 'msw';

// Mock Google OAuth profile endpoint
export const mswHandlers = [
  http.get('https://www.googleapis.com/oauth2/v3/userinfo', () => {
    return HttpResponse.json({
      sub: '1234567890',
      name: 'Test User',
      email: 'test@example.com',
      picture: 'https://example.com/avatar.png',
    });
  }),

  // Mock Google Drive API endpoints
  http.get('https://www.googleapis.com/drive/v3/files', () => {
    return HttpResponse.json({
      files: [
        {
          id: 'board-1',
          name: 'Board 1',
          modifiedTime: new Date().toISOString(),
        },
        {
          id: 'board-2',
          name: 'Board 2',
          modifiedTime: new Date().toISOString(),
        },
      ],
    });
  }),

  http.get('https://www.googleapis.com/drive/v3/files/board-1', () => {
    return HttpResponse.json({
      id: 'board-1',
      name: 'Board 1',
      modifiedTime: new Date().toISOString(),
    });
  }),

  http.get('https://www.googleapis.com/drive/v3/files/board-1?alt=media', () => {
    return HttpResponse.json({
      id: 'board-1',
      name: 'Board 1',
      columns: [
        { id: 'col-1', title: 'To Do', order: 0 },
        { id: 'col-2', title: 'In Progress', order: 1 },
        { id: 'col-3', title: 'Done', order: 2 },
      ],
      cards: {
        'card-1': {
          id: 'card-1',
          title: 'Sample Card',
          descriptionHtml: '<p>This is a sample card</p>',
          type: 'task',
          columnId: 'col-1',
          order: 0,
          labelIds: [],
          boardFieldValues: {},
          typeFieldValues: {},
          parentIds: [],
          checklists: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      labels: [
        { id: 'label-1', name: 'Bug', color: '#c62828' },
        { id: 'label-2', name: 'Feature', color: '#276b2b' },
      ],
      customFields: [],
      cardTypes: [
        { type: 'epic', label: 'Epic', customFields: [] },
        { type: 'story', label: 'Story', customFields: [] },
        { type: 'task', label: 'Task', customFields: [] },
      ],
      updatedAt: new Date().toISOString(),
    });
  }),
];