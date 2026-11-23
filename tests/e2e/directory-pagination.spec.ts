import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const organizations = JSON.parse(
  readFileSync(
    new URL('../../src/data/organizations.json', import.meta.url),
    'utf8',
  ),
) as { slug: string }[];

test('the full directory is reachable through links without JavaScript', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  const seen = new Set<string>();
  const visitedPages = new Set<string>();
  let path: string | null = '/';

  try {
    while (path) {
      expect(visitedPages.has(path)).toBe(false);
      visitedPages.add(path);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://gsocorganizations.xyz${path}`,
      );
      await expect(page.locator('meta[name="robots"]')).not.toHaveAttribute(
        'content',
        /noindex/,
      );

      const links = await page
        .locator('.org-card h2 a')
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('href')!),
        );
      expect(links.length).toBeGreaterThan(0);
      expect(links.length).toBeLessThanOrEqual(48);
      for (const link of links) {
        expect(seen.has(link)).toBe(false);
        seen.add(link);
      }

      const next = page.getByRole('link', {
        name: 'Load more organizations',
      });
      path = (await next.count()) ? await next.getAttribute('href') : null;
    }

    expect(visitedPages.size).toBe(Math.ceil(organizations.length / 48));
    expect([...seen].sort()).toEqual(
      organizations.map((organization) => `/org/${organization.slug}/`).sort(),
    );
  } finally {
    await context.close();
  }
});

test('pagination keeps incremental loading and searches the whole directory', async ({
  page,
}) => {
  await page.goto('/organizations/page/2/');
  await expect(page.getByTestId('explorer')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(page).toHaveTitle('GSoC Organizations | Page 2 of 11');
  await expect(page.getByRole('article')).toHaveCount(48);
  await expect(page.getByText('Showing 49–96 of 519')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Previous page' }),
  ).toHaveAttribute('href', '/');

  const more = page.getByRole('link', { name: 'Load more organizations' });
  await expect(more).toHaveAttribute('href', '/organizations/page/3/');
  await more.click();
  await expect(page.getByRole('article')).toHaveCount(96);
  await expect(more).toHaveAttribute('href', '/organizations/page/4/');
  await expect(page.getByText('Showing 49–144 of 519')).toBeVisible();
  await expect(page.locator('.site-loading')).toBeHidden();

  await page
    .getByRole('searchbox', { name: 'Search organizations' })
    .fill('NumFOCUS');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'NumFOCUS', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('explorer')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'NumFOCUS', exact: true }),
  ).toBeVisible();
});

test('the sitemap includes directory pages with valid boundaries', async ({
  request,
}) => {
  const sitemap = await request.get('/sitemap.xml');
  const xml = await sitemap.text();
  for (let page = 2; page <= Math.ceil(organizations.length / 48); page += 1) {
    expect(xml).toContain(
      `<loc>https://gsocorganizations.xyz/organizations/page/${page}/</loc>`,
    );
  }
  expect((await request.get('/organizations/page/1/')).status()).toBe(404);
  expect((await request.get('/organizations/page/12/')).status()).toBe(404);
});
