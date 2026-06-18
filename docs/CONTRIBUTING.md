# Contributing to DriftLens

## Setup

```bash
git clone https://github.com/driftlens/driftlens
cd driftlens
npm install
npm run build
npm test
```

## Development

```bash
npm run dev       # watch mode (tsup --watch)
npm test          # run tests
npm run test:watch # vitest in watch mode
npm run lint      # eslint
npm run format    # prettier
```

## Project Structure

```
src/
├── cli/          # Commander.js commands
├── detector/     # Multi-signal AI session detection
├── collector/    # Git delta + re-prompt collection
│   └── reprompt/ # Session log parsers + struggle chain detector
├── analyser/     # Embedding, clustering, pattern analysis
├── proposer/     # Skill file writes + GitHub PR creation
├── adapters/     # LLM + embedding + skill format adapters
├── dashboard/    # Fastify server + static HTML/CSS/JS
├── feedback/     # Drift scoring + regression detection
└── shared/       # Types, config, logger, constants
```

## Adding a New Skill Format

1. Add a new adapter class in `src/adapters/skill-formats.ts`
2. Register it in the `getSkillAdapter()` factory
3. Add the file pattern to `SKILL_FILE_PATTERNS` in `src/shared/constants.ts`
4. Add tests in `tests/adapters.test.ts`

## Adding a New LLM Provider

1. Add a new adapter class in `src/adapters/llm-providers.ts`
2. Register it in `createLLMAdapter()` factory
3. Update the `LLMConfig.provider` type in `src/shared/schema.ts`

## Testing

All tests use Vitest. Fixture data lives in `tests/fixtures/`.

```bash
npm test               # run all tests
npm run test:watch     # watch mode
```

## Pull Requests

- Target the `main` branch
- Include tests for new functionality
- Run `npm test` and `npm run lint` before submitting
