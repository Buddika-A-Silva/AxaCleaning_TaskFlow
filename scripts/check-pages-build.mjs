import { readFile } from 'node:fs/promises';

const html = await readFile('dist/index.html', 'utf8');
const fallback = await readFile('dist/404.html', 'utf8');
const forbidden = ['/src/main.tsx', 'src/main.tsx', 'your-project.supabase.co', 'your-public-anon-key'];
for (const value of forbidden) {
  if (html.includes(value) || fallback.includes(value)) throw new Error(`Unexpected unbuilt or placeholder reference in Pages HTML: ${value}`);
}
const basePath = process.env.EXPECTED_BASE_PATH ?? '/';
const normalizedBase = basePath === '/' ? '/' : `/${basePath.replace(/^\/+|\/+$/g, '')}/`;
const escapedBase = normalizedBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const assetPattern = new RegExp(`(?:src|href)="${escapedBase}assets/`);
if (!assetPattern.test(html) || !assetPattern.test(fallback)) throw new Error(`Pages HTML must reference compiled assets under the configured base path ${normalizedBase}.`);
if (!html.includes(`${normalizedBase}manifest.webmanifest`) || !fallback.includes(`${normalizedBase}manifest.webmanifest`)) throw new Error('Pages manifest URL does not match the configured base path.');