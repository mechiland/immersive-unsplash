import { defineContentScript } from 'wxt/utils/define-content-script';
import { startImmersive } from '../src/adapter';
import '../src/immersive.css';

export default defineContentScript({
  matches: ['https://unsplash.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    const controller = startImmersive(window);
    // WXT's Navigation API event fires before location.href changes.
    ctx.addEventListener(window, 'wxt:locationchange', controller.refreshSoon);
    ctx.onInvalidated(controller.stop);
  },
});
