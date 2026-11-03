import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Immersive Unsplash',
    description: 'A reversible desktop layout for browsing Unsplash.',
    minimum_chrome_version: '114',
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
  },
});
