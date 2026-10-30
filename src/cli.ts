#!/usr/bin/env tsx
/**
 * Usage:
 *   npm run generate -- scenarios/checkout.txt --url http://localhost:4173 --out tests/generated/checkout.spec.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import { generateSpec } from './generator';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith('--')) {
    console.error('Usage: npm run generate -- <scenario.txt> --url <url> [--out <spec.ts>] [--title <name>]');
    process.exit(1);
  }
  const scenario = readFileSync(file, 'utf8');
  const url = arg('url', 'http://localhost:4173')!;
  const name = basename(file).replace(/\.\w+$/, '');
  const out = arg('out', `tests/generated/${name}.spec.ts`)!;
  const title = arg('title', name.replace(/[-_]/g, ' '))!;

  const { spec, plan } = await generateSpec({ scenario, url, title });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, spec);
  console.log(`Generated ${plan.steps.length} steps -> ${out}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
