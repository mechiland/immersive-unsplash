/* global document, window, getComputedStyle, innerWidth, innerHeight */
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { log } from 'node:console';
import process from 'node:process';
import { waitForPhotos, photoSelectors } from './browser-visuals.mjs';

const extension = resolve('artifacts/chrome-mv3');
const context = await chromium.launchPersistentContext(resolve('output/playwright/private/visual-profile'), {
  executablePath: process.env.CHROME_PATH || undefined,
  channel: 'chromium', headless: process.env.HEADLESS === '1',
  ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1,
});
const page = context.pages()[0];
const results = [];
async function capture(name, path, scroll = 0) {
  log(`Capturing loaded page: ${name}`);
  await page.goto(`https://unsplash.com${path}`);
  await page.waitForSelector('html[data-iu-active]', { timeout: 45000 });
  if (scroll) await page.evaluate(y => window.scrollTo(0, y), scroll);
  await waitForPhotos(page, photoSelectors[name]);
  await page.screenshot({ path: `output/playwright/screenshots/${name}.png`, scale: 'css' });
  results.push({ name, path, evidence: await page.evaluate(selector => ({
    viewport: { width: innerWidth, height: innerHeight },
    visibleLoadedPhotos: [...document.querySelectorAll(selector)].filter(image => {
      const rect = image.getBoundingClientRect();
      return rect.width > 0 && rect.bottom > 128 && rect.top < innerHeight && image.complete && image.naturalWidth >= 128 && /^https:\/\/(images|plus)\.unsplash\.com\//.test(image.currentSrc || image.src);
    }).length,
    secondaryStickyTop: document.querySelector('[data-iu-secondary-sticky]') && getComputedStyle(document.querySelector('[data-iu-secondary-sticky]')).top,
  }), photoSelectors[name]) });
}
try {
  await capture('illustrations-1440', '/illustrations');
  await capture('illustration-topic', '/t/illustration-award');
  await capture('topic-nature', '/t/nature');
  await capture('search-1440', '/s/photos/forest');
  await capture('search-illustrations', '/s/illustrations/forest');
  await capture('public-profile', '/@unsplash', 700);
  await capture('public-collections', '/@unsplash/collections');
  const href = await page.locator('[data-testid="users-route"] a[href^="/collections/"]').first().getAttribute('href');
  await capture('collection-detail', href);
  await writeFile('output/verification/visual-results.json', JSON.stringify({ mode: 'actual unpacked extension; real decoded photo URLs; no implementation injection', results }, null, 2));
  log(`Captured ${results.length} loaded real-site pages.`);
} finally { await context.close(); }
