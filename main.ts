// Hands the entry in (Node 22, standard library only, no build step): copy app/ and
// screenshots/ beside this file into the output directory (MAKEFUN_OUTPUT_DIR, /output
// inside the grader's container), then write dossier.json with the vendored make.fun
// library. The caps below are the bounty's own; only text_max_bytes shapes the bytes,
// the rest refuse what the scorer would refuse.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
};

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });

const shotsIn = join(here, 'screenshots');
const shotsOut = join(out, 'screenshots');
mkdirSync(shotsOut, { recursive: true });
if (existsSync(shotsIn)) cpSync(shotsIn, shotsOut, { recursive: true });

const dossier = buildDossier(out, CAPS);
const dossierPath = join(out, 'dossier.json');
writeFileSync(dossierPath, dossier);

console.log(`output:      ${out}`);
console.log(`app/:        ${join(out, 'app')}`);
console.log(`screenshots: ${shotsOut}`);
console.log(`dossier.json ${statSync(dossierPath).size} bytes`);
