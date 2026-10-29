/** Unsplash's DOM contract lives here; no hashed site classes or account paths. */
const SEARCH = 'form[data-testid="nav-bar-search-form-form"]';
const DESTINATIONS = [
  { key: 'collections', labels: ['Collections'], text: 'Collections' },
  { key: 'downloads', labels: ['Download History', 'Downloads'], text: 'Download History' },
  { key: 'bookmarks', labels: ['Bookmarks', 'Favorites'], text: 'Bookmarks' },
] as const;

export function supportsRoute(path: string): boolean {
  const normalized = path.replace(/\/+$/, '') || '/';
  return normalized === '/' || normalized === '/illustrations'
    || normalized === '/bookmarks' || normalized === '/downloads'
    || /^\/@[^/]+(?:\/(collections|illustrations))?$/.test(normalized)
    || /^\/collections\/[A-Za-z0-9_-]{8,}(?:\/[^/]+){0,2}$/.test(normalized)
    || /^\/t\/[^/]+$/.test(normalized)
    || /^\/(photos|illustrations)\/[^/]+$/.test(normalized)
    || /^\/s\/(photos|illustrations|collections|users)\/[^/]+$/.test(normalized);
}

/** Only attributes and extension-owned children change. Native nodes stay put. */
class Scope {
  private attributes = new Map<Element, Map<string, { before: string | null; after: string }>>();
  private properties = new Map<HTMLElement, Map<string, { before: string; priority: string; after: string }>>();
  private cleanups: (() => void)[] = [];

  mark(element: Element | null | undefined, name: string, value = '') {
    if (!element) return;
    let attributes = this.attributes.get(element);
    if (!attributes) this.attributes.set(element, attributes = new Map());
    const previous = attributes.get(name);
    attributes.set(name, { before: previous ? previous.before : element.getAttribute(name), after: value });
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }
  own<T extends HTMLElement>(element: T, kind: string): T {
    element.setAttribute('data-iu-owned', kind);
    this.cleanups.push(() => element.remove());
    return element;
  }
  property(element: HTMLElement, name: string, value: string) {
    let properties = this.properties.get(element);
    if (!properties) this.properties.set(element, properties = new Map());
    const previous = properties.get(name);
    properties.set(name, { before: previous?.before ?? element.style.getPropertyValue(name), priority: previous?.priority ?? element.style.getPropertyPriority(name), after: value });
    if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
  }
  listen(target: EventTarget, name: string, listener: EventListener, capture = false) {
    target.addEventListener(name, listener, capture);
    this.cleanups.push(() => target.removeEventListener(name, listener, capture));
  }
  dispose() {
    this.cleanups.reverse().forEach(cleanup => cleanup());
    for (const [element, attributes] of this.attributes) {
      for (const [name, { before, after }] of attributes) {
        if (element.getAttribute(name) !== after) continue;
        if (before === null) element.removeAttribute(name);
        else element.setAttribute(name, before);
      }
    }
    for (const [element, properties] of this.properties) {
      for (const [name, { before, priority, after }] of properties) {
        if (element.style.getPropertyValue(name) !== after) continue;
        if (before) element.style.setProperty(name, before, priority);
        else element.style.removeProperty(name);
      }
    }
    this.cleanups = []; this.attributes.clear(); this.properties.clear();
  }
}

function byLabel(root: ParentNode, labels: readonly string[]) {
  return [...root.querySelectorAll<HTMLElement>('[aria-label]')]
    .find(element => labels.includes(element.getAttribute('aria-label') ?? ''));
}

function discover(doc: Document) {
  const logo = doc.querySelector<HTMLAnchorElement>('a[title="Home — Unsplash"]');
  const side = logo?.closest('nav');
  const search = doc.querySelector<HTMLFormElement>(SEARCH);
  const top = search?.closest('nav');
  const type = side?.querySelector<HTMLButtonElement>('button[aria-label="Select asset type"]:not([data-iu-owned])');
  const photos = side?.querySelector<HTMLAnchorElement>('a[aria-label="Photos"]');
  const illustrations = side?.querySelector<HTMLAnchorElement>('a[aria-label="Illustrations"]');
  const menu = side?.querySelector<HTMLButtonElement>('button[aria-label="Menu"]');
  const layout = side?.parentElement;
  const content = layout && [...layout.children].find(element => element !== side && element.contains(top ?? null));
  const page = top?.parentElement;
  if (!logo || !side || !search || !top || !photos || !illustrations || !menu || !layout || !content || !page) return;
  // The server renders data-hydrated="false". Altering children before the
  // site's effect flips this marker would invalidate React hydration.
  if (search.getAttribute('data-hydrated') !== 'true') return;
  if (!layout.contains(top) || side.contains(top)) return;
  const searchRoute = page.querySelector('[data-testid="search-route"]');
  const candidate = searchRoute?.firstElementChild ?? top.nextElementSibling;
  const list = candidate?.querySelector('ul');
  const tabs = list?.querySelector('a[href^="/t/"], [data-testid^="search-nav-link-"]') ? candidate as HTMLElement : undefined;
  const profileRoute = page.querySelector('[data-testid="users-route"]');
  const profileList = [...profileRoute?.querySelectorAll('ul') ?? []].find(list => list.querySelector('a[href^="/@"][href$="/collections"]'));
  let secondary = profileList?.parentElement;
  while (secondary && secondary !== profileRoute && doc.defaultView?.getComputedStyle(secondary).position !== 'sticky') secondary = secondary.parentElement;
  if (secondary === profileRoute) secondary = undefined;
  const profile = side.querySelector<HTMLButtonElement>('button[aria-label="Profile"]');
  const login = side.querySelector<HTMLAnchorElement>('a[href^="/login"]');
  const plus = top.querySelector<HTMLAnchorElement>('a[href="/plus"]');
  const submit = [...top.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.textContent?.trim() === 'Submit an image');
  return { logo, side, search, top, type, photos, illustrations, menu, layout, content, page, searchRoute, profileRoute, secondary, tabs, profile, login, plus, submit };
}
type ChromeParts = NonNullable<ReturnType<typeof discover>>;

function markAncestors(scope: Scope, element: Element, boundary: Element, attribute: string) {
  for (let parent = element.parentElement; parent && parent !== boundary; parent = parent.parentElement) scope.mark(parent, attribute);
}
function nativePopup(doc: Document, trigger: HTMLElement) {
  const id = trigger.getAttribute('aria-controls');
  if (id) return doc.getElementById(id);
  return [...doc.querySelectorAll<HTMLElement>('[role="menu"]')]
    .find(menu => menu.getAttribute('aria-labelledby') === trigger.id);
}
function closeNative(parts: ChromeParts) {
  for (const trigger of [parts.profile, parts.type, parts.menu, byLabel(parts.side, ['Notifications', 'Language'])]) {
    if (trigger?.isConnected && trigger.getAttribute('aria-expanded') === 'true') trigger.click();
  }
}
function keyboardMenu(menu: HTMLElement, scope: Scope) {
  scope.listen(menu, 'keydown', event => {
    const key = (event as KeyboardEvent).key;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return;
    const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .filter(item => item.getAttribute('aria-disabled') !== 'true' && !item.hidden)
      .sort((a, b) => Number(a.getAttribute('data-iu-order') ?? 0) - Number(b.getAttribute('data-iu-order') ?? 0));
    if (!items.length) return;
    const index = items.indexOf(menu.ownerDocument.activeElement as HTMLElement);
    const next = key === 'Home' ? 0 : key === 'End' ? items.length - 1
      : key === 'ArrowDown' ? (index + 1) % items.length : (index < 0 ? items.length - 1 : index - 1 + items.length) % items.length;
    event.preventDefault(); event.stopImmediatePropagation(); items[next]?.focus();
  }, true);
}
function destination(doc: Document, source: HTMLElement, text: string, key: string, order: number, scope: Scope, close: () => void) {
  const href = source.tagName === 'A' ? source.getAttribute('href') : null;
  const item = href ? doc.createElement('a') : doc.createElement('button');
  if (href) (item as HTMLAnchorElement).setAttribute('href', href);
  else (item as HTMLButtonElement).type = 'button';
  item.setAttribute('role', 'menuitem'); item.tabIndex = -1;
  item.setAttribute('data-iu-destination', key); item.setAttribute('data-iu-order', String(order));
  const icon = source.querySelector('svg')?.cloneNode(true) as SVGElement | undefined;
  if (icon) {
    for (const node of [icon, ...icon.querySelectorAll('*')]) { node.removeAttribute('id'); node.removeAttribute('aria-labelledby'); }
    icon.setAttribute('aria-hidden', 'true'); item.append(icon);
  }
  item.append(doc.createTextNode(text));
  scope.listen(item, 'click', event => {
    const mouse = event as MouseEvent;
    if (href && (mouse.ctrlKey || mouse.metaKey || mouse.shiftKey || mouse.altKey || mouse.button > 0)) return;
    event.preventDefault(); close(); if (source.isConnected) source.click();
  });
  return item;
}
function addDestinations(parts: ChromeParts, menu: HTMLElement, scope: Scope, close: () => void) {
  const group = scope.own(menu.ownerDocument.createElement('div'), 'destinations');
  for (const [order, spec] of DESTINATIONS.entries()) {
    const source = byLabel(parts.side, spec.labels);
    if (source) group.append(destination(menu.ownerDocument, source, spec.text, spec.key, order, scope, close));
  }
  if (group.childElementCount) menu.append(group);
}
function enhanceAccount(parts: ChromeParts, menu: HTMLElement, scope: Scope) {
  const profile = menu.querySelector<HTMLAnchorElement>('a[role="menuitem"][href^="/@"]');
  const settings = [...menu.querySelectorAll<HTMLAnchorElement>('a[role="menuitem"]')]
    .find(link => link.textContent?.trim() === 'Account settings');
  const logout = menu.querySelector<HTMLButtonElement>('form[method="post"] button[role="menuitem"]');
  const submit = [...menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')]
    .find(button => button.textContent?.trim() === 'Submit an image');
  if (!profile || !settings || !logout) return;
  const doc = menu.ownerDocument;
  scope.mark(menu, 'data-iu-menu');
  const account = scope.own(doc.createElement('div'), 'account');
  const name = doc.createElement('strong'); name.setAttribute('data-iu-account-name', '');
  name.textContent = profile.querySelector('span')?.textContent?.trim() ?? '';
  const handle = doc.createElement('span'); handle.setAttribute('data-iu-account-handle', '');
  handle.textContent = new URL(profile.href).pathname.slice(1);
  account.append(name, handle); menu.append(account);
  addDestinations(parts, menu, scope, () => parts.profile?.click());
  scope.mark(profile, 'data-iu-menu-item', 'profile');
  scope.mark(profile, 'aria-label', 'Profile'); scope.mark(profile, 'data-iu-order', '4');
  scope.mark(settings, 'data-iu-menu-item', 'settings'); scope.mark(settings, 'data-iu-order', '5');
  scope.mark(logout, 'data-iu-menu-item', 'logout');
  scope.mark(logout, 'aria-label', 'Logout'); scope.mark(logout, 'data-iu-order', '6');
  if (submit) {
    scope.mark(submit, 'data-iu-menu-item', 'submit'); scope.mark(submit, 'data-iu-order', '3');
    scope.mark(submit.parentElement, 'data-iu-submit-group');
  }
  keyboardMenu(menu, scope);
}

export function startImmersive(win: Window) {
  const doc = win.document;
  let parts: ChromeParts | undefined;
  let layoutScope: Scope | undefined;
  const popups = new Map<HTMLElement, Scope>();
  let guestScope: Scope | undefined;
  let guestTrigger: HTMLButtonElement | undefined;
  let typeScope: Scope | undefined;
  let typeTrigger: HTMLButtonElement | undefined;
  let frame = 0;
  let stopped = false;
  let lastUrl = win.location.href;

  function closeGuest(focus = false) {
    guestScope?.dispose(); guestScope = undefined;
    guestTrigger?.setAttribute('aria-expanded', 'false');
    if (focus) guestTrigger?.focus();
  }
  function closeType(focus = false) {
    typeScope?.dispose(); typeScope = undefined;
    typeTrigger?.setAttribute('aria-expanded', 'false');
    if (focus) typeTrigger?.focus();
  }
  function assetLabel(current: ChromeParts) {
    return /^\/(illustrations|s\/illustrations)(\/|$)/.test(win.location.pathname)
      || /^\/@[^/]+\/illustrations\/?$/.test(win.location.pathname)
      || current.illustrations.hasAttribute('aria-current')
      || !!current.tabs?.querySelector('a[href="/illustrations"]') ? 'Illustrations' : 'Photos';
  }
  function setupType(current: ChromeParts, scope: Scope) {
    if (current.type) return;
    const button = scope.own(doc.createElement('button'), 'type-trigger');
    typeTrigger = button; button.type = 'button';
    button.setAttribute('data-iu-type', ''); button.setAttribute('data-iu-local-type', '');
    button.setAttribute('aria-label', 'Select asset type'); button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.append(doc.createTextNode(assetLabel(current)));
    const chevron = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.setAttribute('viewBox', '0 0 24 24'); chevron.setAttribute('aria-hidden', 'true');
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'm7 9 5 5 5-5 1.4 1.4L12 16.8 5.6 10.4z'); chevron.append(path); button.append(chevron);
    current.side.append(button);
    const open = () => {
      if (typeScope) { closeType(); return; }
      closeGuest(); closeNative(current);
      const local = typeScope = new Scope();
      const menu = local.own(doc.createElement('div'), 'type-menu');
      menu.setAttribute('data-iu-type-menu', ''); menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Asset type');
      button.setAttribute('aria-expanded', 'true');
      menu.append(destination(doc, current.photos, 'Photos', 'photos', 0, local, () => closeType()),
        destination(doc, current.illustrations, 'Illustrations', 'illustrations', 1, local, () => closeType()));
      doc.body.append(menu); keyboardMenu(menu, local); menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    };
    scope.listen(button, 'click', open);
    scope.listen(button, 'keydown', event => {
      if ((event as KeyboardEvent).key === 'ArrowDown') { event.preventDefault(); if (!typeScope) open(); }
    });
    scope.listen(doc, 'pointerdown', event => {
      const target = event.target as Node;
      if (typeScope && !button.contains(target) && !doc.querySelector('[data-iu-type-menu]')?.contains(target)) closeType();
    }, true);
    scope.listen(doc, 'keydown', event => {
      const key = (event as KeyboardEvent).key;
      if (typeScope && (key === 'Escape' || key === 'Tab')) {
        if (key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); }
        closeType(key === 'Escape');
      }
    }, true);
  }
  function setupGuest(current: ChromeParts, scope: Scope) {
    if (current.profile || !current.login) return;
    scope.mark(current.login, 'data-iu-hide');
    const button = scope.own(doc.createElement('button'), 'guest-trigger');
    guestTrigger = button; button.type = 'button';
    button.setAttribute('data-iu-guest-trigger', ''); button.setAttribute('data-iu-profile', '');
    button.setAttribute('aria-label', 'Account'); button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    const icon = current.login.querySelector('svg')?.cloneNode(true) as SVGElement | undefined;
    if (icon) { icon.setAttribute('aria-hidden', 'true'); button.append(icon); }
    current.side.append(button);
    const open = () => {
      if (guestScope) { closeGuest(); return; }
      closeType(); closeNative(current);
      const local = guestScope = new Scope();
      const menu = local.own(doc.createElement('div'), 'guest-menu');
      menu.setAttribute('data-iu-guest-menu', ''); menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', 'Account'); menu.tabIndex = -1;
      button.setAttribute('aria-expanded', 'true');
      addDestinations(current, menu, local, () => closeGuest());
      if (current.submit) {
        const group = doc.createElement('div'); group.setAttribute('data-iu-submit-group', '');
        const submit = destination(doc, current.submit, 'Submit an image', 'submit', 3, local, () => closeGuest());
        submit.setAttribute('data-iu-menu-item', 'submit'); group.append(submit); menu.append(group);
      }
      menu.append(destination(doc, current.login!, 'Log in / Sign up', 'login', 4, local, () => closeGuest()));
      doc.body.append(menu);
      keyboardMenu(menu, local); menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    };
    scope.listen(button, 'click', open);
    scope.listen(button, 'keydown', event => {
      if ((event as KeyboardEvent).key === 'ArrowDown') { event.preventDefault(); if (!guestScope) open(); }
    });
    scope.listen(doc, 'pointerdown', event => {
      const target = event.target as Node;
      if (guestScope && !button.contains(target) && !doc.querySelector('[data-iu-guest-menu]')?.contains(target)) closeGuest();
    }, true);
    scope.listen(doc, 'keydown', event => {
      const key = (event as KeyboardEvent).key;
      if (guestScope && (key === 'Escape' || key === 'Tab')) {
        if (key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); }
        closeGuest(key === 'Escape');
      }
    }, true);
  }
  function enhancePopovers() {
    if (!parts || !layoutScope) return;
    for (const [popup, scope] of popups) {
      if (!popup.isConnected) { scope.dispose(); popups.delete(popup); }
    }
    for (const [label, kind] of [['Profile', 'profile'], ['Select asset type', 'type'], ['Notifications', 'notifications'], ['Menu', 'main'], ['Language', 'language']] as const) {
      const trigger = byLabel(parts.side, [label]);
      const popup = trigger && !trigger.hasAttribute('data-iu-owned') && nativePopup(doc, trigger);
      if (!popup || popups.has(popup)) continue;
      const scope = new Scope(); popups.set(popup, scope);
      scope.mark(popup, 'data-iu-popup', kind);
      if (popup.parentElement?.getAttribute('role') === 'presentation') scope.mark(popup.parentElement, 'data-iu-positioner', kind);
      if (kind === 'profile') enhanceAccount(parts, popup, scope);
    }
  }
  function restore() {
    closeGuest(); guestTrigger = undefined;
    closeType(); typeTrigger = undefined;
    if (parts) closeNative(parts);
    popups.forEach(scope => scope.dispose()); popups.clear();
    layoutScope?.dispose(); layoutScope = undefined; parts = undefined;
  }
  function updateScroll() {
    if (!layoutScope) return;
    if (win.scrollY > 1) layoutScope.mark(doc.documentElement, 'data-iu-scrolled');
    else doc.documentElement.removeAttribute('data-iu-scrolled');
  }
  function refresh() {
    if (stopped) return;
    if (win.location.href !== lastUrl) {
      if (parts) closeNative(parts);
      closeGuest(); closeType(); lastUrl = win.location.href;
    }
    if (win.innerWidth < 1024 || !supportsRoute(win.location.pathname)) { restore(); return; }
    const next = discover(doc);
    if (!next) { restore(); return; }
    if (parts?.side === next.side && parts.top === next.top && parts.search === next.search && parts.logo === next.logo && parts.menu === next.menu && parts.tabs === next.tabs && parts.secondary === next.secondary && parts.profile === next.profile && parts.type === next.type) {
      layoutScope?.property(doc.documentElement, '--iu-viewport-width', `${win.innerWidth}px`);
      if (typeTrigger?.firstChild) typeTrigger.firstChild.textContent = assetLabel(next);
      updateScroll(); enhancePopovers(); return;
    }
    restore(); parts = next; closeNative(next);
    const scope = layoutScope = new Scope();
    scope.property(doc.documentElement, '--iu-viewport-width', `${win.innerWidth}px`);
    scope.mark(doc.documentElement, 'data-iu-active');
    scope.mark(next.layout, 'data-iu-layout'); scope.mark(next.content, 'data-iu-content');
    scope.mark(next.secondary, 'data-iu-secondary-sticky');
    scope.mark(next.side, 'data-iu-side'); scope.mark(next.top, 'data-iu-top');
    scope.mark(next.search, 'data-iu-search'); scope.mark(next.search.parentElement, 'data-iu-search-slot');
    scope.mark(next.logo, 'data-iu-logo'); scope.mark(next.type, 'data-iu-type');
    scope.mark(next.menu, 'data-iu-main'); scope.mark(next.profile, 'data-iu-profile');
    scope.mark(byLabel(next.side, ['Notifications', 'Language']), 'data-iu-notifications');
    for (const element of next.side.querySelectorAll('a, button')) {
      if (element.hasAttribute('data-iu-logo') || element.hasAttribute('data-iu-type') || element.hasAttribute('data-iu-main') || element.hasAttribute('data-iu-profile') || element.hasAttribute('data-iu-notifications')) markAncestors(scope, element, next.side, 'data-iu-nav-group');
      else scope.mark(element, 'data-iu-hide');
    }
    scope.mark(next.plus, 'data-iu-plus');
    for (const child of next.top.children) if (child !== next.search.parentElement) scope.mark(child, 'data-iu-top-group');
    for (const element of next.top.querySelectorAll('a, button')) {
      if (!next.search.contains(element) && element !== next.plus) scope.mark(element, 'data-iu-hide');
    }
    const backdrop = scope.own(doc.createElement('div'), 'backdrop'); backdrop.setAttribute('aria-hidden', 'true'); next.layout.append(backdrop);
    if (next.tabs) {
      scope.mark(doc.documentElement, 'data-iu-two-rows'); scope.mark(next.tabs, 'data-iu-tabs');
      const list = next.tabs.querySelector('ul'); scope.mark(list, 'data-iu-tab-list');
      if (list) markAncestors(scope, list, next.tabs, 'data-iu-tab-wrapper');
    }
    setupType(next, scope); setupGuest(next, scope); updateScroll(); enhancePopovers();
  }
  function schedule() {
    if (!frame && !stopped) frame = win.requestAnimationFrame(() => { frame = 0; refresh(); });
  }
  const observer = new MutationObserver(records => {
    if (stopped || win.innerWidth < 1024 || !supportsRoute(win.location.pathname)) return;
    // Only shell changes trigger discovery. Photo/feed mutations do not query the document.
    if (records.some(record => record.type === 'attributes'
      || (record.target instanceof Element && record.target.closest('[data-base-ui-portal]'))
      || [...record.addedNodes].some(node => node instanceof Element && node.matches('[data-base-ui-portal], [role="menu"]')))) enhancePopovers();
    if (!parts || !parts.side.isConnected || !parts.top.isConnected || !parts.search.isConnected || !parts.logo.isConnected || !parts.menu.isConnected
      || (parts.type && !parts.type.isConnected) || (parts.profile && !parts.profile.isConnected) || (parts.tabs && !parts.tabs.isConnected)
      || records.some(record => record.target === parts?.page || record.target === parts?.side || record.target === parts?.top || record.target === parts?.searchRoute || record.target === parts?.profileRoute)) schedule();
  });
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded', 'aria-controls', 'data-hydrated'] });
  win.addEventListener('resize', schedule); win.addEventListener('popstate', schedule);
  win.addEventListener('pageshow', schedule); win.addEventListener('scroll', updateScroll, { passive: true });
  refresh();
  return {
    refresh,
    refreshSoon: schedule,
    stop() {
      if (stopped) return;
      stopped = true; observer.disconnect(); if (frame) win.cancelAnimationFrame(frame);
      win.removeEventListener('resize', schedule); win.removeEventListener('popstate', schedule);
      win.removeEventListener('pageshow', schedule); win.removeEventListener('scroll', updateScroll);
      restore(); doc.documentElement.removeAttribute('data-iu-scrolled');
    },
  };
}
