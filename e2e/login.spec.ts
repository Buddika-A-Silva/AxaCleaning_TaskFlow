import { expect, test } from '@playwright/test';

test('login is bilingual and does not offer public registration', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('Accounts are provided by your organisation administrator.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch language to Romanian' })).toBeVisible();
  await page.getByRole('button', { name: 'Switch language to Romanian' }).click();
  await expect(page.getByRole('heading', { name: 'Bine ai revenit' })).toBeVisible();
  await expect(page.getByLabel('Nume de utilizator sau e-mail')).toBeVisible();
});

test('login reports backend configuration without using a mock identity', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Connect your Supabase project to get started.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
});
