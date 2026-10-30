# Playwright AI Test Generator

Write a test scenario in plain English, get a readable Playwright test back. When a selector breaks after a UI change, the suite heals it at runtime and tells you which selector to fix.

```text
1. Open http://localhost:4173            test("checkout", async ({ page }) => {
2. Enter 'demo@shoplite.test' in Email      await page.goto("http://localhost:4173");
3. Click Sign in                  ──LLM──▶   await page.getByLabel("Email").fill("demo@shoplite.test");
4. Verify 'Welcome, shopper' is shown         await page.getByRole("button", { name: "Sign in" }).click();
                                              await expect(page.getByText("Welcome, shopper")).toBeVisible();
                                            });
```

## How it works

```text
scenario.txt ─▶ open page ─▶ snapshot elements ─▶ LLM ─▶ JSON test plan ─▶ validate ─▶ render .spec.ts
                                                    ▲                          │
                                                    └──── errors fed back ─────┘  (self-correction, up to 2 retries)
```

**Generation** (`src/generator.ts`)
- Playwright opens the target page and captures a compact list of visible elements (role, accessible name, label, test id). The model sees what is really on the page, not raw HTML.
- The model returns a **JSON plan**, not code. Each step is validated (`src/plan.ts`) and rendered with a fixed template, so generated tests always compile and only use user-facing locators: `getByRole`, `getByLabel`, `getByTestId`.
- If the plan is invalid, the errors go back to the model and it tries again.

**Self-healing** (`src/healing.ts`)
- `heal(selector, description)` tries the original selector first.
- If it matches nothing, the healer snapshots the page and asks the model which element fits the description ("Sign in button on the login form").
- The test continues with the healed locator. Every heal is attached to the Playwright report and appended to `reports/healing-report.jsonl`, so broken selectors still get fixed in source instead of being hidden.

**LLM providers** (`src/llm/provider.ts`): Anthropic, OpenAI, or a deterministic **mock** provider that runs offline. CI uses the mock, so the pipeline never needs an API key.

## Quick start

```bash
npm install
npx playwright install chromium

npm test                     # runs unit, generated and self-healing tests (desktop + mobile viewport)

npm run serve                # demo app on http://localhost:4173 (in another terminal)
npm run generate -- scenarios/checkout.txt --url http://localhost:4173
```

Use a real model:

```bash
cp .env.example .env         # set LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY (or openai)
export $(cat .env | xargs)
npm run generate -- scenarios/invalid-login.txt --url http://localhost:4173
```

## Project layout

| Path | What it is |
| --- | --- |
| `src/generator.ts` | Scenario → snapshot → LLM plan → validated spec, with retry loop |
| `src/plan.ts` | Plan schema, validation and code rendering |
| `src/healing.ts` | Self-healing locator + Playwright fixture (`heal`, `healer`) |
| `src/snapshot.ts` | Page element snapshot sent to the model |
| `src/llm/provider.ts` | Anthropic / OpenAI / offline mock providers |
| `demo-app/` | Small store app used by the tests (its login button id was "renamed" to show healing) |
| `tests/generated/` | Specs produced by the generator from `scenarios/` |
| `tests/self-healing.spec.ts` | Proves a stale selector heals and is reported |
| `tests/unit/` | Plan validation, rendering and provider tests |

## Design choices

- **Plan, then code.** Asking a model to write Playwright code directly gives hallucinated APIs and brittle CSS selectors. A constrained JSON plan is easy to validate and review.
- **Heal loudly.** A silent self-heal hides real regressions. Here each heal is reported with the broken and the healed selector.
- **Runs without a key.** The mock provider keeps CI deterministic and free; swap providers with one environment variable.

## Tech

TypeScript · Playwright · Anthropic / OpenAI APIs · GitHub Actions

## License

MIT
