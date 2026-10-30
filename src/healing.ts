import { test as base, type Locator, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { snapshotElements, type ElementInfo } from './snapshot';
import { extractJson, getProvider, type LLMProvider } from './llm/provider';

export interface HealEvent {
  test: string;
  description: string;
  brokenSelector: string;
  healedSelector: string;
  timestamp: string;
}

const REPORT = 'reports/healing-report.jsonl';

/** Build the most stable selector we can for an element the model picked. */
export function selectorFor(el: ElementInfo): string {
  if (el.testId) return `[data-testid="${el.testId}"]`;
  if (el.id) return `#${el.id}`;
  if (el.role !== 'text' && el.text) return `role=${el.role}[name="${el.text}"]`;
  if (el.label) return `[aria-label="${el.label}"]`;
  return `text=${el.text}`;
}

/**
 * Self-healing locator.
 * 1. Try the original selector.
 * 2. If it matches nothing, snapshot the page and ask the LLM which element best fits
 *    the human description ("Sign in button").
 * 3. Use that element, and log the heal so the broken selector gets fixed in source.
 *    Healing keeps the run going; it never hides the fact that the selector broke.
 */
export class Healer {
  constructor(
    private page: Page,
    private testTitle: string,
    private provider: LLMProvider = getProvider(),
    private timeoutMs = 2000,
  ) {}

  readonly events: HealEvent[] = [];

  async locate(selector: string, description: string): Promise<Locator> {
    const original = this.page.locator(selector);
    try {
      await original.first().waitFor({ state: 'attached', timeout: this.timeoutMs });
      return original;
    } catch {
      // fall through to healing
    }

    const elements = await snapshotElements(this.page);
    const prompt = [
      'TASK: HEAL_LOCATOR',
      `A test selector stopped matching: ${selector}`,
      `DESCRIPTION: ${description}`,
      'Pick the element that best matches the description. Reply ONLY with {"index": <number>} or {"index": -1} if none fits.',
      `ELEMENTS:${JSON.stringify(elements.map((e) => ({ index: e.index, text: [e.role, e.text, e.label, e.testId].filter(Boolean).join(' ') })))}`,
    ].join('\n');
    const { index } = extractJson<{ index: number }>(await this.provider.complete('You repair broken UI test locators.', prompt));
    const match = elements.find((e) => e.index === index);
    if (!match) throw new Error(`Locator "${selector}" (${description}) is broken and could not be healed`);

    const healed = selectorFor(match);
    const event: HealEvent = {
      test: this.testTitle,
      description,
      brokenSelector: selector,
      healedSelector: healed,
      timestamp: new Date().toISOString(),
    };
    this.events.push(event);
    mkdirSync('reports', { recursive: true });
    appendFileSync(REPORT, JSON.stringify(event) + '\n');
    console.warn(`[self-heal] "${selector}" -> "${healed}" (${description})`);
    return this.page.locator(healed);
  }
}

/** Playwright fixture: `test('...', async ({ page, heal }) => { await (await heal('#old', 'Sign in button')).click(); })` */
export const test = base.extend<{ heal: (selector: string, description: string) => Promise<Locator>; healer: Healer }>({
  healer: async ({ page }, use, testInfo) => {
    const healer = new Healer(page, testInfo.title);
    await use(healer);
    if (healer.events.length) {
      await testInfo.attach('self-heal-events', {
        body: JSON.stringify(healer.events, null, 2),
        contentType: 'application/json',
      });
    }
  },
  heal: async ({ healer }, use) => {
    await use((selector, description) => healer.locate(selector, description));
  },
});

export { expect } from '@playwright/test';
