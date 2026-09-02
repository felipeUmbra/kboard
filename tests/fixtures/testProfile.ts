/**
 * Deterministic fake Google profile used by every test.
 * Matches the shape the app expects from /oauth2/v3/userinfo.
 */
export const testProfile = {
  id: "fake-user-001",
  name: "Test User",
  email: "tester@example.com",
  picture: undefined as string | undefined,
};

export type TestProfile = typeof testProfile;