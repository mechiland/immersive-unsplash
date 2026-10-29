/* global document, innerHeight */
export async function waitForPhotos(page, selector) {
  await page.waitForFunction(selector => {
    const visible = [...document.querySelectorAll(selector)].filter(image => {
      const rect = image.getBoundingClientRect();
      return rect.width >= 128 && rect.height >= 96 && rect.bottom > 128 && rect.top < innerHeight;
    });
    const loaded = visible.filter(image => {
      const src = image.currentSrc || image.src;
      return /^https:\/\/(images|plus)\.unsplash\.com\//.test(src) && image.complete && image.naturalWidth >= 128;
    });
    return visible.length > 0 && loaded.length >= Math.min(3, visible.length);
  }, selector, { timeout: 30000 });
}

export const photoSelectors = {
  'illustrations-1440': 'figure a[href^="/illustrations/"] img',
  'illustration-topic': 'figure a[href^="/illustrations/"] img',
  'topic-nature': 'figure a[href^="/photos/"] img',
  'search-1440': 'figure a[href^="/photos/"] img',
  'search-restored-scroll': 'figure a[href^="/photos/"] img',
  'search-illustrations': 'figure a[href^="/illustrations/"] img',
  'photo-detail': '[role="dialog"] img',
  'public-profile': 'figure img',
  'public-collections': '[data-testid="users-route"] a[href^="/collections/"] img',
  'collection-detail': 'figure img',
};
