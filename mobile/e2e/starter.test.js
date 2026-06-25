describe('Sanity', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  it('should show the login screen', async () => {
    // Unauthenticated launch always lands on login.
    // login.tsx root SafeAreaView carries testID="login-screen".
    await waitFor(element(by.id('login-screen')))
      .toBeVisible()
      .withTimeout(10000);
  });
});
