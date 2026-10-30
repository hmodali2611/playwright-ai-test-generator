import { test, expect } from '../src/healing';

/**
 * The demo app renamed its login button id from "login-btn" to "signin-submit".
 * This test still uses the old selector, as many real suites do after a redesign.
 * The healer finds the button from its description, the test passes, and the
 * heal is logged to reports/healing-report.jsonl so the selector can be fixed.
 */
test('login still works after the button id changed', async ({ page, heal, healer }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('demo@shoplite.test');
  await page.getByLabel('Password').fill('secret123');

  const signIn = await heal('#login-btn', 'Sign in button on the login form');
  await signIn.click();

  await expect(page.getByRole('heading', { name: 'Welcome, shopper' })).toBeVisible();
  expect(healer.events).toHaveLength(1);
  expect(healer.events[0].healedSelector).toBe('#signin-submit');
});

test('a healthy selector is used as-is, with no heal event', async ({ page, heal, healer }) => {
  await page.goto('/');
  await (await heal('#signin-submit', 'Sign in button')).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(healer.events).toHaveLength(0);
});
