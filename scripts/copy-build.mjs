import { cp, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(`${root}artifacts`, { recursive: true });
await cp(`${root}.output/chrome-mv3`, `${root}artifacts/chrome-mv3`, { recursive: true, force: true });
for (const file of await readdir(`${root}.output`)) {
  if (file.endsWith('-chrome.zip')) await cp(`${root}.output/${file}`, `${root}artifacts/${file}`);
}
