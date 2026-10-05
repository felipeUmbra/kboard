// Storybook test setup
import MockDate from 'mockdate';
import { mswHandlers } from './msw-handlers';
import { setupServer } from 'msw/node';

const server = setupServer(...mswHandlers);

beforeAll(() => {
  server.listen();
  MockDate.set('2024-04-01T12:00:00Z');
  localStorage.setItem('theme', 'dark');
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
  MockDate.reset();
});