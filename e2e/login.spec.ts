import { expect, test } from '@playwright/test';

test('login is English-only and does not offer public registration', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('AXA Cleaning');
  await expect(page.getByText('AXA Cleaning', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.brand-logo-image').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('Accounts are provided by your organisation administrator.')).toBeVisible();
  await expect(page.getByRole('button', { name: /switch language/i })).toHaveCount(0);
  await expect(page.getByLabel('Username or email')).toBeVisible();
});

test('login renders credentials without offering public registration', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Username or email')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('link', { name: /sign up|register/i })).toHaveCount(0);
});
