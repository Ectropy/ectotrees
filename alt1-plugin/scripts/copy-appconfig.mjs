import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const source = path.join(rootDir, 'appconfig.json');
const target = path.join(rootDir, 'dist', 'appconfig.json');

await fs.mkdir(path.dirname(target), { recursive: true });
await fs.copyFile(source, target);
