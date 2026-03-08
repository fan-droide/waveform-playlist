import { test, expect } from '@playwright/test';

/**
 * Media Element Playout tests
 *
 * The Media Element example renders two independent players:
 * 1. Default playhead (simple vertical line)
 * 2. Custom playhead (PlayheadWithMarker) + Timescale
 *
 * The custom playhead exercises the hook isolation pattern
 * (CustomMediaElementPlayhead wrapper) that prevents
 * "Rendered more hooks" errors.
 */

test.describe('Media Element Example', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/examples/media-element`);
    await page.waitForSelector('h1:has-text("Media Element")', { timeout: 30000 });
  });

  test.describe('Custom Playhead (PlayheadWithMarker)', () => {
    test('playback with custom playhead produces no console errors', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      // The second player has the custom playhead (PlayheadWithMarker)
      // Find its Play button — there are two sets of controls
      const playButtons = page.getByRole('button', { name: /Play/ });
      await expect(playButtons.nth(1)).toBeVisible();

      // Start playback on the custom playhead player
      await playButtons.nth(1).click();

      // Let it play briefly
      await page.waitForTimeout(1000);

      // Stop playback
      const stopButtons = page.getByRole('button', { name: /Stop/ });
      await stopButtons.nth(1).click();

      // Check for hook-related errors
      const hookErrors = consoleErrors.filter(
        (e) => e.includes('Rendered more hooks') || e.includes('Rendered fewer hooks')
      );
      expect(hookErrors).toHaveLength(0);
    });
  });

  test.describe('Playback Controls', () => {
    test('play and stop work on default playhead player', async ({ page }) => {
      const playButtons = page.getByRole('button', { name: /Play/ });
      const stopButtons = page.getByRole('button', { name: /Stop/ });

      await expect(playButtons.first()).toBeVisible();

      // Start playback
      await playButtons.first().click();
      await page.waitForTimeout(500);

      // Stop playback
      await stopButtons.first().click();
    });

    test('speed controls are visible', async ({ page }) => {
      await expect(page.getByRole('button', { name: '0.5x' }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: '1x' }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: '2x' }).first()).toBeVisible();
    });
  });
});
