import { chromium } from '@playwright/test';
import { describeElements, snapshotElements } from './snapshot';
import { extractJson, getProvider, type LLMProvider } from './llm/provider';
import { renderSpec, validatePlan, type TestPlan } from './plan';

const SYSTEM_PROMPT = `You are a senior SDET. Convert a plain-English test scenario into a JSON test plan for Playwright.
Rules:
- Reply with ONLY a JSON object: {"steps": [...]}.
- Allowed actions: goto, fill, click, check, select, expectText, expectVisible, expectUrl.
- Targets: {"by":"role","role":"button","value":"Sign in"} | {"by":"label","value":"Email"} | {"by":"testid","value":"cart"} | {"by":"placeholder","value":"Search"} | {"by":"text","value":"..."}.
- Prefer role and label targets, then test ids. Never invent elements that are not in PAGE ELEMENTS.
- Every scenario must end with at least one expect* assertion.`;

export interface GenerateOptions {
  scenario: string;
  url: string;
  title: string;
  provider?: LLMProvider;
  maxRetries?: number;
}

/**
 * Open the page, snapshot its elements, ask the LLM for a plan, validate it,
 * and retry with the validation errors if the plan is malformed (self-correction loop).
 */
export async function generateSpec(opts: GenerateOptions): Promise<{ spec: string; plan: TestPlan }> {
  const provider = opts.provider ?? getProvider();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(opts.url);
    const elements = describeElements(await snapshotElements(page));

    let prompt = `BASE URL: ${opts.url}\nSCENARIO:\n${opts.scenario}\nPAGE ELEMENTS:\n${elements}`;
    const retries = opts.maxRetries ?? 2;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const reply = await provider.complete(SYSTEM_PROMPT, prompt);
      let plan: TestPlan;
      try {
        plan = extractJson<TestPlan>(reply);
      } catch (e) {
        prompt += `\n\nYour last reply was not valid JSON (${(e as Error).message}). Reply with JSON only.`;
        continue;
      }
      const errors = validatePlan(plan);
      if (errors.length === 0) return { plan, spec: renderSpec(opts.title, plan, opts.scenario) };
      prompt += `\n\nYour last plan had problems:\n- ${errors.join('\n- ')}\nFix them and reply with JSON only.`;
    }
    throw new Error(`Could not get a valid test plan after ${retries + 1} attempts`);
  } finally {
    await browser.close();
  }
}
