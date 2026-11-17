// main.ts — Node 22 ESM entry: stage app/ + screenshots/ into the output dir,
// then write dossier.json exactly as the bounty's scorer would.
import { cp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-frontend.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
};

async function stage(name) {
  const from = join(ROOT, name);
  if (!existsSync(from)) throw new Error(`main.ts: missing ${name}/ at ${from}`);
  await rm(join(OUT, name), { recursive: true, force: true });
  await cp(from, join(OUT, name), { recursive: true });
}

async function main() {
  await mkdir(OUT, { recursive: true });

  await stage('app');
  await stage('screenshots');

  const dossier = buildDossier(OUT, CAPS);
  const outFile = join(OUT, 'dossier.json');
  await writeFile(outFile, dossier);

  console.log(`dossier.json: ${dossier.byteLength} bytes -> ${outFile}`);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
