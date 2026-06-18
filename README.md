# DriftLens

Observability platform for AI-assisted development. Proves ROI in dollars, predicts failures, and routes tasks to the best agent.

[![npm version](https://img.shields.io/npm/v/driftlens?style=flat-square&logo=npm)](https://www.npmjs.com/package/driftlens)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](https://opensource.org/licenses/MIT)
[![GitHub Tests](https://img.shields.io/github/actions/workflow/status/Ashutosh-Panda2004/DriftLens/ci.yml?style=flat-square&logo=github&label=tests)](https://github.com/Ashutosh-Panda2004/DriftLens/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

## The Problem

Your company spends $10-100 per developer per month on AI coding tools. You have zero data on whether that investment pays off. GitHub claims "94% productivity gains," but no tool lets you measure your reality, your codebase, and your team.

### Current Challenges

- **Endless Corrections**: Developers waste 15-40% of AI-collaboration time correcting mistakes that AI keeps repeating.
- **Blind Agent Selection**: Nobody knows which agent (Copilot, Claude, Cursor, Gemini) works best for which parts of the code.
- **Silent Regressions**: When AI providers update models, previously-fixed patterns regress without anyone noticing.
- **Dead Skill Rules**: Skill files (CLAUDE.md, .cursorrules) accumulate 200+ rules that cost tokens but prevent nothing.

### The Solution

DriftLens provides observability for AI coding productivity. It sits above all your AI tools and answers questions no one else can answer.

## Key Capabilities

| Feature | Description |
|---------|-------------|
| AI Productivity Ledger | Calculate dollar ROI: "AI saved $4,020 but cost $1,029 in corrections. Net: $2,992" |
| Predictive Prevention | Prevent mistakes before generation via MCP context injection |
| Agent Quality Matrix | "Claude is 94% accurate in services but 61% in GraphQL - use Copilot there" |
| Model Regression Sentinel | "Sonnet 5 broke 3 patterns that Sonnet 4 had learned" |
| Context Economics | "This rule saves $83/month; that rule costs tokens with zero benefit" |
| Cross-Agent Unification | Detect conflicts and gaps between CLAUDE.md, .cursorrules, and SKILL.md |
| AI Maturity Score | Composite organization health score: 72/100 (industry average: 45) |

## Supported AI Tools

| Agent | Skill Format | MCP Prevention | Status |
|-------|--------------|---|---|
| GitHub Copilot | `.github/skills/SKILL.md` | Yes | Supported |
| Claude (Anthropic) | `CLAUDE.md` | Yes | Supported |
| Cursor | `.cursor/rules/` | Yes | Supported |
| Google Gemini | `GEMINI.md` | Yes | Supported |
| Windsurf | `.windsurfrules` | Yes | Supported |
| Codex CLI | `AGENTS.md` | Yes | Supported |
| Any MCP Host | `.driftlens/rules/` | Yes | Supported |

## Installation

### Using npm

```bash
npm install -g github:Ashutosh-Panda2004/DriftLens
```

### Using yarn

```bash
yarn global add github:Ashutosh-Panda2004/DriftLens
```

### Using pnpm

```bash
pnpm add -g github:Ashutosh-Panda2004/DriftLens
```

## Quick Start

Initialize DriftLens in your project (takes 30 seconds):

```bash
cd your-project
driftlens init
```

This command:
- Installs a post-commit git hook
- Creates the `.driftlens/` configuration directory
- Registers the MCP prevention server
- You can start using it immediately with your normal workflow

## Usage

### Observation Commands

Passive data collection requires zero friction.

```bash
driftlens watch start          # Begin AI-assisted session
# ... use Claude, Copilot, Cursor, etc. ...
driftlens watch stop           # End session
driftlens mark HEAD            # Tag a commit retroactively
driftlens status               # Show all captured corrections
```

### Intelligence Analysis

Access insights that no other tool provides.

```bash
driftlens analyse              # Discover patterns in corrections
driftlens roi                  # AI Productivity Ledger - calculate dollar ROI
driftlens roi --team           # Team-level ROI report
driftlens agents               # Agent Quality Matrix - determine best agent per file type
driftlens agents --recommend   # Best agent for your current project
driftlens health               # Organizational AI Maturity Score (0-100)
driftlens regression           # Detect model update regressions
```

### Predictive Prevention

Stop mistakes before they happen.

```bash
driftlens prevent              # Start MCP prevention server
driftlens predict src/foo.ts   # Predicted failures for a file
driftlens constraints          # View active constraints
```

### Skill Improvement

Enhance and maintain skill files automatically.

```bash
driftlens propose              # Open draft PRs to skill files
driftlens propose --dry-run    # Preview changes before applying
driftlens unify                # Cross-agent skill audit and propagation
driftlens trim                 # Context economics and dead rule removal
```

### Reporting

Generate reports for different audiences.

```bash
driftlens dashboard            # Visual intelligence dashboard
driftlens report               # Executive summary report (PDF)
driftlens score                # Drift score and friction score
```

## Usage Examples

### AI Productivity Ledger Example

```bash
$ driftlens roi

AI Productivity Ledger - Last 30 Days

TIME SAVED by AI generation:        +47.3 hours
TIME LOST to corrections:           -12.1 hours
NET AI PRODUCTIVITY GAIN:           +35.2 hours

At $85/hr (configured):
   Value generated:   $4,020
   Value destroyed:   -$1,029
   NET ROI:           $2,992 (3.9x return on $769 tool spend)

TREND: Up 14% vs last month (skills improving)

Per-Agent Breakdown:
   Claude:    +$1,840  (best for: services, auth)
   Copilot:   +$920    (best for: tests, components)
   Cursor:    +$232    (best for: styling, config)
```

### Predictive Prevention Example

```bash
$ driftlens predict src/features/auth/AuthService.ts

Predicted Failures - AuthService.ts (Risk: HIGH)

89% - Will use fetch() instead of service layer
   Constraint: "Use authService singleton from @/services"

76% - Will import from ../services not @/services
   Constraint: "Always use @/ path alias for imports"

64% - Will instantiate with new instead of singleton
   Constraint: "Never use new AuthService(), use singleton export"

Prevention: 3 constraints auto-injected via MCP server
Last month: 11 corrections prevented by prediction layer
```

### Agent Quality Matrix Example

```bash
$ driftlens agents

Agent Quality Matrix - Your Codebase

                    Copilot   Claude   Cursor   Gemini
React components:    88%       91%      85%      79%
Service layer:       72%       94%      78%      81%
Database queries:    85%       76%      82%      93%
Test writing:        91%       89%      87%      84%
GraphQL resolvers:   61%       88%      72%      68%

Recommendation for graphql/resolvers/user.ts:
   Use Claude (88%) instead of Copilot (61%)
   Potential time saved: 4.2 minutes per generation
```

### Pattern Analysis and Skill Proposal Example

```bash
$ driftlens status

DriftLens Status

Total corrections captured: 47
   git_delta:      12
   reprompt:       28
   struggle_chain:  7
   churn:           0

Date range: 2026-05-20 to 2026-06-09

Top files by correction count:
   8 corrections - src/features/profile/ProfilePage.tsx
   6 corrections - src/services/UserService.ts
   5 corrections - src/features/auth/AuthService.ts

Struggle chains: 7
   Average turns per chain: 3.4
   Average friction score: 3.4

$ driftlens analyse

Analyzing 47 corrections...
Embedding corrections...
Clustering by semantic similarity...
Found 3 cluster(s) with 3 or more occurrences
Analyzing patterns with LLM...

Found 3 pattern(s) and saved to patterns.json
   91% confidence - service-layer-enforcement (14 corrections)
   87% confidence - service-singleton-import (8 corrections)
   79% confidence - path-alias-usage (5 corrections)

Next: driftlens propose --dry-run
```

### Skill File Proposal Example

```bash
$ driftlens propose --dry-run

DRY RUN: Would write to CLAUDE.md

## Learned Rules

Added by DriftLens on 2026-06-09
14 corrections across 3 weeks
Confidence: 0.91
Average friction: 3.4 turns

### Service Layer Enforcement

Never call fetch() or axios directly in React components.
Always use services from src/features/[feature]/services/ or @/services.

Bad example:
const data = await fetch('/api/users')

Good example:
const data = await userService.getAll()

### Service Singleton Import

Always use: import { authService } from '@/services'
Never use relative imports: import { authService } from '../../../services'
Never instantiate: const svc = new AuthService()

### Path Alias Usage

Always use @/ for project root imports
Never use ../../../ relative paths
Enables better refactoring and cleaner diffs
```

## How It Works

DriftLens operates in five sequential layers:

### Layer 0: Capture (Multi-Signal Observation)

DriftLens identifies AI-assisted commits and captures corrections through multiple methods:

- Explicit session bracketing with `driftlens watch start/stop` (100% confidence)
- Copilot Agent Hooks detection
- Session logs from Claude, Cursor, Aider, and Copilot
- Git delta analysis to detect what AI wrote vs what you committed
- Re-prompt analysis from your correction instructions in session logs
- Struggle chain detection for multi-turn correction sequences (3+ turns)
- Timing data from generation to commit timestamps
- Agent and model version tracking for each generation

### Layer 1: Intelligence Engine

The core analysis engine processes captured corrections:

- **Productivity Ledger**: Calculates time saved vs time lost and dollar ROI per agent
- **Agent Quality Matrix**: Determines per-agent accuracy by file type and module
- **Failure Predictor**: Builds per-file mistake probability models
- **Regression Sentinel**: Detects when model updates break previously-fixed patterns
- **Context Economics**: Calculates per-rule token cost versus corrections prevented
- **Maturity Scorer**: Generates composite organizational AI health metrics

### Layer 2: Predictive Prevention

Real-time, proactive mistake prevention:

- MCP Server provides file-specific constraints to any MCP-compatible agent
- Context injection injects learned constraints before AI generates code
- Agent Router recommends the best agent for current task context
- Prevention tracking measures corrections avoided versus corrections that still occurred

### Layer 3: Skill Improvement

Automatic skill file optimization:

- Cluster corrections and name patterns
- Generate rule proposals
- Create draft pull requests via GitHub or GitLab (never silent writes)
- Cross-agent propagation spreads rules to all agent formats
- Stale rule detection archives dead-weight rules based on economics
- Protected sections remain untouched

### Layer 4: Reporting

Reporting adapts to different audiences:

- Developer reports: patterns, predictions, agent scores
- Manager reports: team ROI, productivity trends, tool comparison
- Executive reports: maturity scores, budget justification (PDF format)
- Scheduled digests: Slack and email notifications

## Configuration

DriftLens creates `.driftlens/config.json` during initialization:

```json
{
  "llm": {
    "provider": "anthropic",
    "analysisModel": "claude-sonnet-4-6",
    "proposalModel": "claude-opus-4-6",
    "apiKey": "env:ANTHROPIC_API_KEY"
  },
  "embeddings": {
    "provider": "voyage",
    "model": "voyage-code-3",
    "apiKey": "env:VOYAGE_API_KEY"
  }
}
```

### Supported Providers

LLM providers: `anthropic`, `openai`, `gemini`, `ollama`

Embedding providers: `voyage`, `openai`, `ollama`

**Important Note**: Anthropic does not offer an embedding API. Use Voyage AI (recommended), OpenAI, or Ollama for embeddings.

## Privacy and Security

- All corrections are stored locally in `.driftlens/corrections.jsonl`
- Data is never sent to external APIs until you explicitly run `driftlens analyse` or `driftlens propose`
- The post-commit hook runs in the background and never blocks your workflow
- API keys are stored in `.driftlens/config.json` (add to .gitignore)
- You maintain complete control over what gets analyzed and uploaded

## Documentation

- [How DriftLens Works](docs/HOW-IT-WORKS.md) - Deep dive into architecture and mechanisms
- [Contributing Guide](docs/CONTRIBUTING.md) - How to contribute features and fixes
- [Configuration Reference](docs/CONFIG.md) - Complete configuration options explanation

## Roadmap

### Version 0.2.0 (Current)

Completed:
- 18 new features including reason taxonomy, meta-patterns, contradiction detection
- Test synthesis capabilities
- Team registry implementation
- MCP prevention server with constraint injection
- Regression sentinel for model update detection
- Cross-agent skill unification
- Agent quality matrix with sample-size suppression
- 108 passing tests in TypeScript strict mode

### Version 0.3.0 (Q3 2026)

Planned:
- Slack and email digest scheduling
- GitHub issue integration for pattern proposals
- Fine-grained team metrics per developer
- Custom LLM integrations (Grok, Mistral, etc.)
- Web UI dashboard (currently CLI and static HTML)

### Version 0.4.0+ (Q4 2026+)

Planned:
- VS Code extension for inline predictions
- Jupyter notebook support
- Batch analysis of historical repositories
- ML-powered agent routing

## Real-World Use Case

Example: Acme Corp (React/TypeScript team of 12 developers)

### Before DriftLens

- 2,400 USD per month on AI tools (Copilot, Claude)
- No visibility into tool effectiveness
- Perception that AI generated more bugs than code
- Skill files contained 200+ lines of stale rules

### After DriftLens (3 months)

- Dashboard shows 8,400 USD monthly ROI
- Claude identified as 94% accurate in backend; Copilot in frontend
- 47% reduction in AI-generated bugs through prevention
- Trimmed skill files to 28 high-ROI rules
- Team uses `driftlens agents` to route tasks to appropriate tools
- Discovered Auth Service pattern was 3x error-prone; fixed shared pattern
- CFO approved 2x increase in tool budget

### Key Metric

Reduction in time spent on AI corrections:
- Before: 15-40% of AI-collaboration time
- After: 5-8% of AI-collaboration time
- Calculation: 35 hours/month saved per developer × 12 developers = 420 hours = 35,700 USD/month in business value

## Frequently Asked Questions

**Q: Does DriftLens work with my IDE?**

A: DriftLens runs at the git hook and CLI level, so it works with any IDE (VS Code, JetBrains, Vim, etc.). A VS Code extension for inline predictions is planned for version 0.3.

**Q: What if I use multiple AI agents?**

A: DriftLens auto-detects and works with GitHub Copilot, Claude, Cursor, Gemini, and any MCP-compatible tool simultaneously. The Agent Quality Matrix shows which agent is best for which files.

**Q: Is there a web dashboard?**

A: Yes. Running `driftlens dashboard` spins up a local HTML dashboard with visualizations. A persistent web UI is being built for version 0.3.

**Q: Can I export reports?**

A: Yes. The `driftlens report` command generates executive PDFs, and `driftlens roi --export-csv` exports metrics for spreadsheets.

**Q: What team or enterprise features are available?**

A: Version 0.2 includes team registry and cross-developer contradiction detection. Version 0.3 will add team dashboards and Slack integration.

## Contributing

Contributions are welcome. See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for:
- Development setup instructions
- Coding standards
- Testing requirements
- Pull request process

## License

MIT License - See [LICENSE](LICENSE) for details

## Acknowledgments

Built with the following technologies and tools:

- TypeScript - Type safety and developer experience
- Claude and OpenAI - LLM-based analysis capabilities
- Voyage AI - Code embedding and semantic analysis
- Semgrep - Rule synthesis and code pattern detection
- Model Context Protocol - Constraint injection and integration
- Vitest - 108 passing comprehensive tests

## Support and Community

- Report bugs: [GitHub Issues](https://github.com/Ashutosh-Panda2004/DriftLens/issues)
- Ask questions: [GitHub Discussions](https://github.com/Ashutosh-Panda2004/DriftLens/discussions)
- Star the repository if you find it useful
- Contact via GitHub profile for direct communication

---

Made with care by [Ashutosh Panda](https://github.com/Ashutosh-Panda2004)

The observability platform for AI-assisted development.

[Back to top](#driftlens)
