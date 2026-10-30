/**
 * Thin LLM abstraction so the framework is not tied to one vendor.
 * Set LLM_PROVIDER=anthropic | openai | mock (default: mock, runs offline).
 */
export interface LLMProvider {
  readonly name: string;
  complete(system: string, user: string): Promise<string>;
}

class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  constructor(private apiKey: string, private model: string) {}

  async complete(system: string, user: string): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { content: { type: string; text?: string }[] };
    return data.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
  }
}

class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  constructor(private apiKey: string, private model: string) {}

  async complete(system: string, user: string): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0].message.content;
  }
}

/**
 * Deterministic offline provider. It understands a small plain-English grammar
 * ("Open ...", "Enter 'x' in Email", "Click Sign in", "Verify 'Welcome' is shown")
 * and answers locator-healing prompts with the closest-matching element.
 * Lets the demo and CI run with no API key.
 */
export class MockProvider implements LLMProvider {
  readonly name = 'mock';

  async complete(_system: string, user: string): Promise<string> {
    if (user.includes('TASK: HEAL_LOCATOR')) return this.heal(user);
    return this.plan(user);
  }

  private plan(user: string): string {
    const scenario = user.split('SCENARIO:')[1]?.split('PAGE ELEMENTS:')[0] ?? '';
    const steps: unknown[] = [];
    for (const raw of scenario.split('\n')) {
      const line = raw.replace(/^\s*(\d+[.)]|-|\*)\s*/, '').trim();
      if (!line) continue;
      let m: RegExpMatchArray | null;
      if ((m = line.match(/^(?:open|go to|navigate to)\s+(\S+)/i))) {
        steps.push({ action: 'goto', value: m[1] });
      } else if ((m = line.match(/^(?:enter|type|fill)\s+['"](.+?)['"]\s+(?:in|into)\s+(?:the\s+)?(.+?)(?:\s+field)?$/i))) {
        steps.push({ action: 'fill', target: { by: 'label', value: m[2] }, value: m[1] });
      } else if ((m = line.match(/^(?:click|press|tap)\s+(?:on\s+)?(?:the\s+)?(.+?)(?:\s+button|\s+link)?$/i))) {
        steps.push({ action: 'click', target: { by: 'role', role: 'button', value: m[1] } });
      } else if ((m = line.match(/^(?:verify|check|expect|assert)\s+['"](.+?)['"]\s+(?:is\s+)?(?:shown|visible|displayed|appears)/i))) {
        steps.push({ action: 'expectText', value: m[1] });
      }
    }
    return JSON.stringify({ steps });
  }

  private heal(user: string): string {
    const description = (user.match(/DESCRIPTION:\s*(.+)/)?.[1] ?? '').toLowerCase();
    const elementsJson = user.split('ELEMENTS:')[1] ?? '[]';
    const elements = JSON.parse(elementsJson) as { index: number; text: string }[];
    const words = description.split(/\W+/).filter(Boolean);
    let best = { index: -1, score: 0 };
    for (const el of elements) {
      const text = el.text.toLowerCase();
      const score = words.filter((w) => text.includes(w)).length;
      if (score > best.score) best = { index: el.index, score };
    }
    return JSON.stringify({ index: best.index });
  }
}

export function getProvider(): LLMProvider {
  const choice = (process.env.LLM_PROVIDER ?? 'mock').toLowerCase();
  if (choice === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
    return new AnthropicProvider(key, process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5');
  }
  if (choice === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY is not set');
    return new OpenAIProvider(key, process.env.OPENAI_MODEL ?? 'gpt-4o-mini');
  }
  return new MockProvider();
}

/** Pull the first JSON object out of a model reply (models sometimes wrap it in prose or fences). */
export function extractJson<T>(text: string): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`No JSON object in model reply: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1)) as T;
}
