import type { Page } from '@playwright/test';

/** A compact, LLM-friendly description of one interactive element on the page. */
export interface ElementInfo {
  index: number;
  tag: string;
  role: string;
  text: string;
  label?: string;
  testId?: string;
  id?: string;
  placeholder?: string;
}

// Runs inside the browser. Kept as a plain string so TS/esbuild helpers
// (e.g. __name) are never injected into page context.
const SNAPSHOT_SCRIPT = `(() => {
  const selector = 'a, button, input, select, textarea, [role], [data-testid], h1, h2, h3, label, p';
  const nodes = Array.from(document.querySelectorAll(selector));
  function implicitRole(el) {
    const tag = el.tagName.toLowerCase();
    if (el.getAttribute('role')) return el.getAttribute('role');
    if (tag === 'a') return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      if (el.type === 'checkbox') return 'checkbox';
      if (el.type === 'submit' || el.type === 'button') return 'button';
      return 'textbox';
    }
    if (/^h[1-6]$/.test(tag)) return 'heading';
    return 'text';
  }
  function labelFor(el) {
    if (el.id) {
      const l = document.querySelector('label[for="' + el.id + '"]');
      if (l) return l.textContent.trim();
    }
    const wrap = el.closest('label');
    return el.getAttribute('aria-label') || (wrap ? wrap.textContent.trim() : undefined);
  }
  return nodes
    .filter((el) => el.offsetParent !== null)
    .map((el, index) => ({
      index,
      tag: el.tagName.toLowerCase(),
      role: implicitRole(el),
      text: (el.innerText || el.value || '').trim().slice(0, 80),
      label: labelFor(el),
      testId: el.getAttribute('data-testid') || undefined,
      id: el.id || undefined,
      placeholder: el.getAttribute('placeholder') || undefined,
    }));
})()`;

/**
 * Collect the page's visible interactive and text-bearing elements.
 * Sending this (instead of raw HTML) keeps prompts small and steers the model
 * toward user-facing locators: role, label, test id.
 */
export async function snapshotElements(page: Page): Promise<ElementInfo[]> {
  return page.evaluate(SNAPSHOT_SCRIPT) as Promise<ElementInfo[]>;
}

/** One line per element: cheap on tokens, easy for a model to scan. */
export function describeElements(elements: ElementInfo[]): string {
  return elements
    .map((e) => {
      const parts = [`[${e.index}] ${e.role}`];
      if (e.text) parts.push(`text="${e.text}"`);
      if (e.label) parts.push(`label="${e.label}"`);
      if (e.testId) parts.push(`testid="${e.testId}"`);
      if (e.placeholder) parts.push(`placeholder="${e.placeholder}"`);
      return parts.join(' ');
    })
    .join('\n');
}
