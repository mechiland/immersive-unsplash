/* global document, window, innerWidth, innerHeight, devicePixelRatio, getComputedStyle, scrollY */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { log } from 'node:console';
import { chromium } from 'playwright';
import { photoSelectors, waitForPhotos } from './browser-visuals.mjs';

// Real, unpacked production extension. No request mocks or implementation injection.
const extension = resolve('artifacts/chrome-mv3');
const output = resolve('output/playwright');
await mkdir(`${output}/screenshots`, { recursive: true });
await mkdir('output/verification', { recursive: true });
const context = await chromium.launchPersistentContext(`${output}/private/live-profile`, {
  executablePath: process.env.CHROME_PATH || undefined,
  channel: 'chromium', headless: process.env.HEADLESS === '1',
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1,
});
const page = context.pages()[0] ?? await context.newPage();
const report = { timestamp: new Date().toISOString(), mode: 'real-site, unpacked MV3 extension, logged out', checks: [], errors: [] };
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && /React error|removeChild|NotFoundError|Uncaught/.test(message.text())) report.errors.push(message.text().split('\n')[0]);
});
const save = () => writeFile('output/verification/live-results.json', JSON.stringify(report, null, 2));
async function screenshot(name) {
  if (photoSelectors[name]) await waitForPhotos(page, photoSelectors[name]);
  return page.screenshot({ path: `${output}/screenshots/${name}.png`, scale: 'css' });
}
const active = () => page.waitForSelector('html[data-iu-active]', { timeout: 45000 });
async function check(name, fn) {
  log(`Checking: ${name}`);
  try {
    const evidence = await fn(); report.checks.push({ name, passed: true, evidence }); await save();
  } catch (error) {
    report.checks.push({ name, passed: false, error: error.message }); await screenshot('failure'); await save(); throw error;
  }
}
async function closePopup() { await page.keyboard.press('Escape'); }
async function scroll(y) {
  await page.evaluate(y => window.scrollTo(0, y), y);
  await page.waitForFunction(y => Math.abs(window.scrollY - y) < 2, y);
}
async function geometry() {
  return page.evaluate(() => {
    const search = document.querySelector('[data-iu-search]');
    const rect = search.getBoundingClientRect();
    const controls = [...document.querySelectorAll('[data-iu-logo], [data-iu-type], [data-iu-plus], [data-iu-profile], [data-iu-notifications], [data-iu-main]')]
      .map(node => ({ name: node.getAttribute('aria-label') || node.textContent.trim(), rect: node.getBoundingClientRect().toJSON() }));
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      search: rect.toJSON(), searchBackground: getComputedStyle(search).backgroundColor,
      backdrop: { background: getComputedStyle(document.querySelector('[data-iu-owned="backdrop"]')).backgroundColor, blur: getComputedStyle(document.querySelector('[data-iu-owned="backdrop"]')).backdropFilter },
      tabs: document.querySelector('[data-iu-tabs]')?.getBoundingClientRect().toJSON(),
      scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, controls,
    };
  });
}
function assertGeometry(data) {
  assert(Math.abs(data.search.x + data.search.width / 2 - data.viewport.width / 2) < 1, 'search must be centered in the CSS viewport');
  assert(data.scrollWidth <= data.clientWidth, 'no extra horizontal overflow');
  const areas = [...data.controls.map(item => item.rect), data.search].sort((a, b) => a.x - b.x);
  for (let i = 1; i < areas.length; i++) assert(areas[i].x - areas[i - 1].right >= 12, 'navigation controls need at least 12px separation');
  assert.equal(data.tabs.y, 64); assert.equal(data.tabs.height, 52);
}

try {
  await page.goto('https://unsplash.com/'); await active();
  await check('production extension activates after site hydration without React errors', async () => {
    assert.equal(await page.locator('[data-iu-owned="backdrop"]').count(), 1);
    assert.equal(await page.locator('[data-iu-profile]').getAttribute('aria-label'), 'Account');
    assert.equal(report.errors.length, 0); return { extension, page: page.url() };
  });
  for (const width of [1024, 1280, 1440, 1920]) {
    await check(`home geometry, scroll and menu bounds at ${width} CSS px`, async () => {
      await page.setViewportSize({ width, height: 1000 }); await active(); await scroll(0);
      await page.waitForTimeout(100);
      const top = await geometry(); assertGeometry(top); await screenshot(`home-${width}`);
      await scroll(700); await page.waitForSelector('html[data-iu-scrolled]');
      const scrolled = await geometry(); assertGeometry(scrolled);
      assert.equal(top.searchBackground, scrolled.searchBackground); assert(scrolled.backdrop.blur.includes('18px'));
      assert.notEqual(top.backdrop.background, scrolled.backdrop.background); await screenshot(`home-${width}-scrolled`);
      await page.getByRole('button', { name: 'Account', exact: true }).click();
      const menu = await page.locator('[data-iu-guest-menu]').boundingBox();
      assert(menu.x >= 0 && menu.x + menu.width <= width && menu.y + menu.height <= 1000);
      await screenshot(`guest-menu-${width}`); await closePopup(); await scroll(0);
      return { top, scrolled, menu };
    });
  }
  await check('1000px fallback and reapply at 1024px without refresh', async () => {
    await page.setViewportSize({ width: 1000, height: 1000 });
    await page.waitForSelector('html:not([data-iu-active])');
    assert.equal(await page.locator('[data-iu-owned]').count(), 0); await screenshot('home-1000');
    await page.setViewportSize({ width: 1024, height: 1000 }); await active(); assertGeometry(await geometry());
    await page.setViewportSize({ width: 1440, height: 1000 }); return { fallback: 1000, reapplied: 1024 };
  });
  await check('guest menu keyboard, outside click and native Collections feature gate', async () => {
    const trigger = page.getByRole('button', { name: 'Account', exact: true });
    await trigger.click(); await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-iu-destination')), 'login');
    await closePopup(); assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Account');
    await trigger.click(); await page.locator('h1').first().click(); assert.equal(await page.locator('[data-iu-guest-menu]').count(), 0);
    await trigger.click(); await page.getByRole('menuitem', { name: 'Collections', exact: true }).click();
    await page.getByRole('heading', { name: 'Create your personal collections', exact: true }).waitFor();
    await screenshot('guest-collections-gate'); await closePopup(); return { nativeFeatureGate: true };
  });
  await check('native Menu and visual search retain their popovers', async () => {
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.locator('[data-iu-popup="main"]').waitFor(); await screenshot('main-menu'); await closePopup();
    await page.locator('[data-iu-search]').getByRole('button', { name: 'Visual search', exact: true }).click();
    const control = await page.locator('[data-iu-search]').getByRole('button', { name: 'Visual search', exact: true }).getAttribute('aria-controls');
    await page.locator(`[id="${control}"]`).waitFor(); await screenshot('visual-search'); await closePopup(); return { mainMenu: true, visualSearch: true };
  });
  await check('Photos/Illustrations type switch, illustration topic and history', async () => {
    await page.getByRole('button', { name: 'Select asset type', exact: true }).click();
    await page.locator('[role="menu"] a[href="/illustrations"]').click(); await page.waitForURL('**/illustrations'); await active();
    await screenshot('illustrations-1440');
    assert((await page.getByRole('button', { name: 'Select asset type', exact: true }).innerText()).includes('Illustrations'));
    const topic = page.locator('[data-iu-tab-list] a[href^="/t/"]').first(); const href = await topic.getAttribute('href');
    await topic.click(); await page.waitForURL(`**${href}`); await active(); await screenshot('illustration-topic');
    await page.goBack(); await page.waitForURL('**/illustrations'); await active();
    await page.goForward(); await page.waitForURL(`**${href}`); await active();
    await page.getByRole('button', { name: 'Select asset type', exact: true }).click();
    await page.locator('[role="menu"] a[href="/"]').click(); await page.waitForURL('https://unsplash.com/'); await active();
    return { illustrationTopic: href, history: true };
  });
  await check('photo topic, search suggestions, search submit and search filters', async () => {
    await page.locator('[data-iu-tab-list] a[href="/t/nature"]').click(); await page.waitForURL('**/t/nature'); await active(); await screenshot('topic-nature');
    const input = page.locator('[data-iu-search] input'); await input.fill('forest');
    await page.getByRole('option').first().waitFor(); const suggestions = await page.getByRole('option').count();
    await screenshot('search-suggestions'); await input.press('Enter'); await page.waitForURL('**/s/photos/forest'); await active();
    await page.locator('[data-testid="search-nav-link-photos"]').waitFor(); await screenshot('search-1440');
    await page.getByRole('button', { name: 'License', exact: true }).click(); await page.getByRole('menu', { name: 'License', exact: true }).waitFor(); await closePopup();
    return { suggestions, route: page.url(), filters: true };
  });
  await check('search refresh initializes the header to the actual restored scroll position', async () => {
    // Give the browser a chance to persist the scroll position before reload.
    await scroll(700); await page.waitForTimeout(600); await page.reload(); await active();
    await page.waitForTimeout(250);
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-iu-scrolled') === (scrollY > 1));
    const restoredScroll = await page.evaluate(() => scrollY);
    const data = await geometry(); assertGeometry(data); await screenshot('search-restored-scroll');
    // Unsplash sometimes resets SPA-originated history entries to the top.
    // refresh-baseline.json separately verifies real 700px restoration with and without the extension.
    return { requestedScroll: 700, restoredScroll, data };
  });
  await check('photo detail modal preserves extension, scroll lock and return position', async () => {
    const photo = page.locator('figure a[href^="/photos/"]').first(); await photo.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => scrollY); const href = await photo.getAttribute('href'); await photo.click();
    await page.waitForURL(`**${href}`); await page.locator('[role="dialog"]:visible').waitFor(); await active();
    assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node).overflow), 'hidden');
    await screenshot('photo-detail'); await closePopup(); await page.waitForURL('**/s/photos/forest');
    await page.waitForFunction(() => getComputedStyle(document.body).overflow !== 'hidden');
    assert(Math.abs(await page.evaluate(() => scrollY) - before) < 3); return { href, restoredScroll: before };
  });
  await check('search tabs switch to Illustrations and retain the current type after refresh', async () => {
    await page.locator('[data-testid="search-nav-link-illustrations"]').click(); await page.waitForURL('**/s/illustrations/forest'); await active();
    await page.reload(); await active();
    assert((await page.getByRole('button', { name: 'Select asset type', exact: true }).innerText()).includes('Illustrations'));
    await screenshot('search-illustrations'); return { route: page.url() };
  });
  await check('home infinite scrolling and native load-more behavior', async () => {
    await page.locator('[data-iu-logo]').click(); await page.waitForURL('https://unsplash.com/'); await active();
    await page.locator('[data-testid="search-route"]').waitFor({ state: 'detached' });
    await page.locator('figure').first().waitFor(); await page.waitForTimeout(200);
    const count = await page.locator('figure').count();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForFunction(count => document.querySelectorAll('figure').length > count || [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Load more'), count);
    const load = page.getByRole('button', { name: 'Load more', exact: true });
    if (await load.isVisible()) await load.click();
    await page.waitForFunction(count => document.querySelectorAll('figure').length > count, count);
    const after = await page.locator('figure').count(); return { before: count, after };
  });
  await check('public profile, personal collection list and collection detail reuse the browsing chrome', async () => {
    await page.goto('https://unsplash.com/@unsplash'); await active();
    await page.locator('[data-testid="users-route"]').waitFor(); await scroll(700);
    const sticky = await page.locator('[data-iu-secondary-sticky]').boundingBox();
    assert.equal(sticky.y, 64, 'profile tabs must clear the taller header');
    assert.equal(await page.locator('[data-iu-tabs]').count(), 0, 'profile content must not become a category bar');
    await screenshot('public-profile');
    const tab = page.locator('[data-testid="users-route"] ul a[href$="/collections"]').first();
    const listHref = await tab.getAttribute('href'); await tab.click(); await page.waitForURL(`**${listHref}`); await active();
    await screenshot('public-collections');
    const collection = page.locator('[data-testid="users-route"] a[href^="/collections/"]').first();
    const href = await collection.getAttribute('href'); await collection.click(); await page.waitForURL(`**${href}`); await active();
    await screenshot('collection-detail'); return { publicProfile: '/@unsplash', collection: href, stickyTop: sticky.y };
  });
  await check('login destination returns to native special-page layout', async () => {
    await scroll(0); await page.getByRole('button', { name: 'Account', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Log in / Sign up', exact: true }).click(); await page.waitForURL('**/login**');
    await page.waitForSelector('html:not([data-iu-active])'); assert.equal(await page.locator('[data-iu-owned]').count(), 0);
    await screenshot('native-login'); return { pathname: new URL(page.url()).pathname };
  });
  assert.equal(report.errors.length, 0, 'no React or runtime errors during real-site navigation');
  await save(); log(`Passed ${report.checks.length} real-site checks.`);
} finally { await save(); await context.close(); }
