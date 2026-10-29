import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startImmersive, supportsRoute } from '../src/adapter';
import { browsingFixture, profilePopup } from './fixture';

let controller: ReturnType<typeof startImmersive> | undefined;
const settle = () => new Promise(resolve => setTimeout(resolve, 45));

beforeEach(() => {
  history.replaceState({}, '', '/');
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1440 });
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
  document.body.innerHTML = browsingFixture();
});
afterEach(() => { controller?.stop(); controller = undefined; document.body.innerHTML = ''; });

describe('route safety', () => {
  it.each(['/', '/illustrations', '/t/nature', '/s/photos/forest', '/s/illustrations/forest', '/photos/example-photo-id', '/illustrations/example-illustration-id', '/bookmarks', '/downloads', '/@fixture', '/@fixture/collections', '/@fixture/illustrations', '/collections/fixture1234/example'])('supports observed browsing route %s', path => {
    expect(supportsRoute(path)).toBe(true);
  });
  it.each(['/login', '/join', '/account', '/account/settings', '/submit', '/nlogout', '/oauth/callback', '/unknown'])('leaves special or unknown route %s alone', path => {
    expect(supportsRoute(path)).toBe(false);
  });
});

describe('reversible site adaptation', () => {
  it('waits for the site hydration marker before adding any nodes', async () => {
    const form = document.querySelector('form')!;
    form.removeAttribute('data-hydrated');
    controller = startImmersive(window);
    expect(document.querySelector('[data-iu-owned]')).toBeNull();
    expect(document.documentElement.hasAttribute('data-iu-active')).toBe(false);
    form.setAttribute('data-hydrated', 'true'); await settle();
    expect(document.documentElement.hasAttribute('data-iu-active')).toBe(true);
  });
  it('applies repeatedly without moving native controls or duplicating nodes', () => {
    const form = document.querySelector('form');
    const profile = document.querySelector('#profile');
    const markup = document.body.innerHTML;
    controller = startImmersive(window);
    controller.refresh(); controller.refresh();
    expect(document.documentElement.hasAttribute('data-iu-active')).toBe(true);
    expect(document.querySelectorAll('[data-iu-owned="backdrop"]')).toHaveLength(1);
    expect(form?.parentElement?.id).toBe('search-slot');
    expect(profile?.parentElement?.parentElement?.id).toBe('sidebar');
    controller.stop();
    expect(document.body.innerHTML).toBe(markup);
    expect(document.documentElement.hasAttribute('data-iu-active')).toBe(false);
  });

  it('restores at 1023px, reapplies at 1024px, and restores on unsupported navigation', () => {
    controller = startImmersive(window);
    window.innerWidth = 1023; controller.refresh();
    expect(document.querySelector('[data-iu-side]')).toBeNull();
    window.innerWidth = 1024; controller.refresh();
    expect(document.querySelector('[data-iu-side]')).not.toBeNull();
    history.pushState({}, '', '/account'); controller.refresh();
    expect(document.documentElement.hasAttribute('data-iu-active')).toBe(false);
  });

  it('defers Navigation API events until the new URL has committed', async () => {
    controller = startImmersive(window);
    controller.refreshSoon();
    history.pushState({}, '', '/account');
    await settle();
    expect(document.documentElement.hasAttribute('data-iu-active')).toBe(false);
  });

  it('does not rediscover the document when new photos are appended', async () => {
    controller = startImmersive(window);
    const query = vi.spyOn(document, 'querySelector');
    for (let i = 0; i < 30; i++) document.querySelector('#feed')!.append(document.createElement('figure'));
    query.mockClear(); await settle();
    expect(query).not.toHaveBeenCalled();
  });

  it('initializes and updates the scroll backdrop without altering body scroll lock', async () => {
    window.scrollY = 600;
    document.body.style.overflow = 'hidden';
    controller = startImmersive(window);
    expect(document.documentElement.hasAttribute('data-iu-scrolled')).toBe(true);
    window.scrollY = 0; window.dispatchEvent(new Event('scroll')); await settle();
    expect(document.documentElement.hasAttribute('data-iu-scrolled')).toBe(false);
    controller.stop(); expect(document.body.style.overflow).toBe('hidden');
  });

  it('uses the actual viewport width and removes only its own CSS variable on restoration', () => {
    controller = startImmersive(window);
    expect(document.documentElement.style.getPropertyValue('--iu-viewport-width')).toBe('1440px');
    document.documentElement.style.setProperty('overflow', 'hidden');
    window.innerWidth = 1024; controller.refresh();
    expect(document.documentElement.style.getPropertyValue('--iu-viewport-width')).toBe('1024px');
    controller.stop();
    expect(document.documentElement.style.getPropertyValue('--iu-viewport-width')).toBe('');
    expect(document.documentElement.style.overflow).toBe('hidden');
    document.documentElement.style.removeProperty('overflow');
  });

  it('handles delayed mounting and replacement of the site shell', async () => {
    document.body.innerHTML = '';
    controller = startImmersive(window);
    document.body.innerHTML = browsingFixture(); await settle();
    expect(document.querySelector('[data-iu-side]')).not.toBeNull();
    document.querySelector('#site')!.outerHTML = browsingFixture(); await settle();
    expect(document.querySelectorAll('[data-iu-owned="backdrop"]')).toHaveLength(1);
    expect(document.querySelector('[data-iu-side]')).not.toBeNull();
  });

  it('reapplies when the site replaces only the nested search form', async () => {
    controller = startImmersive(window);
    const replacement = document.createElement('form');
    replacement.setAttribute('data-testid', 'nav-bar-search-form-form');
    replacement.setAttribute('data-hydrated', 'true'); replacement.setAttribute('role', 'search');
    document.querySelector('[data-iu-search]')!.replaceWith(replacement);
    await settle();
    expect(replacement.hasAttribute('data-iu-search')).toBe(true);
    expect(document.querySelectorAll('[data-iu-owned="backdrop"]')).toHaveLength(1);
  });

  it('fails safely if the semantic navigation contract is missing', () => {
    document.querySelector('#top')!.remove();
    controller = startImmersive(window);
    expect(document.documentElement.hasAttribute('data-iu-active')).toBe(false);
    expect(document.querySelector('[data-iu-owned]')).toBeNull();
  });

  it('does not turn profile content containing a list into a sticky category bar', () => {
    history.replaceState({}, '', '/@fixture/collections');
    document.querySelector('#tabs')!.outerHTML = '<div data-testid="users-route"><div>Profile</div><ul><li><a href="/@fixture">Photos</a></li><li><a href="/@fixture/collections">Collections</a></li></ul><div>Collection content</div></div>';
    controller = startImmersive(window);
    expect(document.documentElement.hasAttribute('data-iu-active')).toBe(true);
    expect(document.querySelector('[data-iu-tabs]')).toBeNull();
  });
});

describe('native account menu', () => {
  it('adds observed account destinations once and forwards clicks to the original link', async () => {
    const collections = document.querySelector<HTMLAnchorElement>('a[aria-label="Collections"]')!;
    const clicked = vi.fn((event: Event) => event.preventDefault());
    collections.addEventListener('click', clicked);
    controller = startImmersive(window);
    document.body.insertAdjacentHTML('beforeend', profilePopup()); await settle();
    controller.refresh(); controller.refresh();
    const menu = document.querySelector('[data-iu-menu]')!;
    expect(menu.querySelectorAll('[data-iu-owned="destinations"]')).toHaveLength(1);
    expect(menu.querySelector('[data-iu-account-name]')?.textContent).toBe('Fixture Person');
    expect(menu.querySelector('[data-iu-account-handle]')?.textContent).toBe('@fixture');
    expect(menu.querySelector('[data-iu-menu-item="profile"]')?.getAttribute('aria-label')).toBe('Profile');
    expect(menu.querySelector('form')?.getAttribute('action')).toBe('/nlogout');
    (menu.querySelector('[data-iu-destination="collections"]') as HTMLElement).click();
    expect(clicked).toHaveBeenCalledTimes(1);
    window.innerWidth = 900; controller.refresh();
    expect(menu.querySelector('[data-iu-owned]')).toBeNull();
    expect(menu.querySelector('#native-profile')?.hasAttribute('aria-label')).toBe(false);
  });

  it('includes the added destinations in keyboard traversal', async () => {
    controller = startImmersive(window);
    document.body.insertAdjacentHTML('beforeend', profilePopup()); await settle();
    const menu = document.querySelector<HTMLElement>('[data-iu-menu]')!;
    menu.focus(); menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement?.getAttribute('data-iu-destination')).toBe('collections');
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement?.getAttribute('data-iu-destination')).toBe('downloads');
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement?.getAttribute('data-iu-menu-item')).toBe('logout');
  });

  it('does not fabricate an account menu for logged-out visitors', () => {
    document.querySelector('#profile')!.remove();
    controller = startImmersive(window);
    expect(document.querySelector('[data-iu-account-name]')).toBeNull();
  });

  it('keeps logged-out gated actions bound to the original buttons', () => {
    document.querySelector('#profile')!.remove();
    document.querySelector('#sidebar > div:last-child')!.insertAdjacentHTML('afterbegin', '<a aria-label="Log in / Sign up" href="/login?referrer=%2F"><svg></svg></a>');
    const original = document.querySelector('[aria-label="Collections"]')!;
    const button = document.createElement('button');
    button.setAttribute('aria-label', 'Collections'); original.replaceWith(button);
    const clicked = vi.fn(); button.addEventListener('click', clicked);
    controller = startImmersive(window);
    (document.querySelector('[data-iu-guest-trigger]') as HTMLElement).click();
    const menu = document.querySelector('[data-iu-guest-menu]')!;
    expect(menu.querySelector('[data-iu-account-name]')).toBeNull();
    expect(menu.querySelector('a[href="/login?referrer=%2F"]')).not.toBeNull();
    (menu.querySelector('[data-iu-destination="collections"]') as HTMLElement).click();
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-iu-guest-menu]')).toBeNull();
  });
});

describe('asset type menu when absent from the original search header', () => {
  it('creates a selector from the observed native links without moving them', () => {
    document.querySelector('#type')!.remove();
    const photos = document.querySelector('a[aria-label="Photos"]')!;
    const illustrations = document.querySelector('a[aria-label="Illustrations"]')!;
    const click = vi.fn((event: Event) => event.preventDefault()); illustrations.addEventListener('click', click);
    controller = startImmersive(window);
    const trigger = document.querySelector<HTMLElement>('[data-iu-local-type]')!;
    expect(trigger?.textContent).toContain('Photos');
    trigger.click();
    const menu = document.querySelector('[data-iu-type-menu]')!;
    expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(2);
    (menu.querySelector('a[href="/illustrations"]') as HTMLElement).click();
    expect(click).toHaveBeenCalledTimes(1);
    expect(photos.parentElement?.parentElement?.parentElement?.id).toBe('sidebar');
    expect(document.querySelector('[data-iu-type-menu]')).toBeNull();
  });

  it('shows the current illustration type and restores the original header at small widths', () => {
    document.querySelector('#type')!.remove();
    history.pushState({}, '', '/s/illustrations/forest');
    const markup = document.body.innerHTML;
    controller = startImmersive(window);
    expect(document.querySelector('[data-iu-local-type]')?.textContent).toContain('Illustrations');
    window.innerWidth = 900; controller.refresh();
    expect(document.body.innerHTML).toBe(markup);
  });

  it('updates the fallback label when a route reuses the same navigation nodes', () => {
    document.querySelector('#type')!.remove();
    controller = startImmersive(window);
    history.pushState({}, '', '/s/illustrations/forest'); controller.refresh();
    expect(document.querySelector('[data-iu-local-type]')?.textContent).toContain('Illustrations');
  });
});
