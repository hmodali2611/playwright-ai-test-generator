import { test, expect } from '@playwright/test';
import { renderLocator, renderSpec, validatePlan } from '../../src/plan';
import { MockProvider, extractJson } from '../../src/llm/provider';

test.describe('plan validation', () => {
  test('accepts a well-formed plan', () => {
    const plan = {
      steps: [
        { action: 'goto', value: '/' },
        { action: 'click', target: { by: 'role', role: 'button', value: 'Sign in' } },
        { action: 'expectText', value: 'Welcome' },
      ],
    };
    expect(validatePlan(plan)).toEqual([]);
  });

  test('rejects unknown actions, missing targets and missing values', () => {
    const errors = validatePlan({
      steps: [{ action: 'hover' }, { action: 'click' }, { action: 'fill', target: { by: 'label', value: 'Email' } }],
    });
    expect(errors).toEqual([
      'step 1: unknown action "hover"',
      'step 2: missing or invalid target',
      'step 3: missing value',
    ]);
  });

  test('rejects an empty plan', () => {
    expect(validatePlan({ steps: [] })).toEqual(['plan has no steps']);
  });
});

test.describe('rendering', () => {
  test('uses user-facing locators', () => {
    expect(renderLocator({ by: 'role', role: 'button', value: 'Sign in' })).toBe(
      'page.getByRole("button", { name: "Sign in" })',
    );
    expect(renderLocator({ by: 'label', value: 'Email' })).toBe('page.getByLabel("Email")');
    expect(renderLocator({ by: 'testid', value: 'cart' })).toBe('page.getByTestId("cart")');
  });

  test('escapes quotes so generated code always compiles', () => {
    const spec = renderSpec('quote test', { steps: [{ action: 'expectText', value: 'He said "hi"' }] }, 'x');
    expect(spec).toContain('page.getByText("He said \\"hi\\"")');
  });
});

test.describe('mock provider', () => {
  test('turns plain English into a valid plan', async () => {
    const reply = await new MockProvider().complete(
      '',
      "SCENARIO:\n1. Open /\n2. Enter 'a@b.com' in Email\n3. Click Sign in\n4. Verify 'Welcome' is shown\nPAGE ELEMENTS:\n",
    );
    const plan = extractJson<{ steps: unknown[] }>(reply);
    expect(validatePlan(plan)).toEqual([]);
    expect(plan.steps).toHaveLength(4);
  });

  test('extractJson tolerates prose and code fences around the JSON', () => {
    expect(extractJson<{ a: number }>('Sure!\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });
});
