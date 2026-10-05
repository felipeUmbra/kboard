// Mock for virtual:pwa-register
// This mocks the PWA registration module for Storybook

export const registerSW = () => {
  return Promise.resolve();
};

export const updateSW = () => {
  return Promise.resolve();
};

export const onNeedRefresh = () => {
  // No-op
};

export const onOfflineReady = () => {
  // No-op
};

export const onAppInstalled = () => {
  // No-op
};