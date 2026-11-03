# Immersive Unsplash

A Chrome extension that gives Unsplash a more spacious desktop layout. It moves browsing navigation to the top so you can focus on the images while keeping Unsplash's search, account, and photo controls available.

## Features

- Browse photos, illustrations, topics, and search results with a streamlined top navigation.
- Open image details and use Unsplash's usual photo and account actions.
- Access collections, bookmarks, and download history from the account menu when signed in.
- Automatically return to the standard Unsplash layout in windows narrower than 1024 pixels and on pages the extension doesn't support.

## Install in Chrome

1. Clone or download this repository and open a terminal in its folder.
2. Install [mise](https://mise.jdx.dev/getting-started.html), then run:

   ```sh
   mise trust mise.toml
   mise install
   mise exec -- pnpm install --frozen-lockfile
   mise exec -- pnpm build
   ```

3. Open `chrome://extensions` in Chrome and turn on **Developer mode**.
4. Click **Load unpacked** and select the `artifacts/chrome-mv3` folder inside the project.
5. Refresh any open Unsplash pages.

After updating and rebuilding the extension, click **Reload** on its card at `chrome://extensions`, then refresh Unsplash.

## Availability

The extension is designed for the English-language desktop version of Unsplash. Changes to Unsplash or differences in language and region may affect how it works. Sign-in, account settings, and submission pages keep the standard Unsplash layout.

## License

[MIT License](LICENSE)
