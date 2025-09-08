import { test, expect } from '@playwright/test';

test.describe('Basic E2E Test', () => {
    test('should load test page', async ({ page }) => {
        // Navigate to the test server
        await page.goto('http://localhost:7778/health');

        // Get the response
        const response = await page.evaluate(() => document.body.textContent);

        // Parse JSON response
        const healthData = JSON.parse(response || '{}');

        // Verify health check
        expect(healthData.status).toBe('healthy');
        expect(healthData.wsPort).toBe(7778);
    });

    test('should load dashboard page', async ({ page }) => {
        // Navigate to dashboard
        await page.goto('http://localhost:7778/dashboard');

        // Wait for page to load
        await page.waitForLoadState('networkidle');

        // Check for dashboard element
        const dashboard = await page.locator('#dashboard').first();
        await expect(dashboard).toBeVisible();
    });
});
