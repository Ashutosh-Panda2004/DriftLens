# DriftLens

**The observability platform for AI-assisted development. Proves ROI in dollars. Predicts failures. Routes to the best agent.**

[![npm version](https://badge.fury.io/js/driftlens.svg)](https://badge.fury.io/js/driftlens)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
(https://github.com/driftlens/driftlens/actions)

---

## The Problem

Your company spends $10–100/developer/month on AI coding tools. **You have zero data on whether that investment pays off.** GitHub claims "94% productivity gains" - but no tool lets you measure YOUR reality, for YOUR codebase, with YOUR team.

Meanwhile:
- Developers waste 15-40% of AI-collaboration time correcting mistakes the AI keeps repeating
- Nobody knows which agent (Copilot, Claude, Cursor, Gemini) works best for which parts of your code
- When AI providers update their models, previously-fixed patterns silently regress - nobody notices
- Skill files (CLAUDE.md, .cursorrules) accumulate dead-weight rules that cost tokens but prevent nothing

**DriftLens is Datadog for AI coding productivity.** It sits above ALL your AI tools and answers the questions no one else can.

---

## What DriftLens Does (That Nothing Else Can)

| Capability | What you get | Who else does this? |
|---|---|---|
| **AI Productivity Ledger™** | Dollar ROI: "AI saved $4,020 but cost $1,029 in corrections. Net: $2,992" | Nobody |
| **Predictive Prevention** | Prevents mistakes BEFORE generation via MCP context injection | Nobody |
| **Agent Quality Matrix** | "Claude is 94% accurate in services but 61% in GraphQL - use Copilot there" | Nobody |
| **Model Regression Sentinel** | "Sonnet 5 broke 3 patterns that Sonnet 4 had learned" | Nobody |
| **Context Economics** | "This rule saves $83/month; that rule costs tokens with zero benefit" | Nobody |
| **Cross-Agent Unification** | Detects conflicts & gaps between CLAUDE.md / .cursorrules / SKILL.md | Nobody |
| **AI Maturity Score** | Composite org-health score: 72/100 (industry avg: 45) | Nobody |

---

## Works With Every Major AI Coding Tool

| Agent | Skill Format | MCP Prevention | Supported |
|---|---|---|---|
| GitHub Copilot | `.github/skills/SKILL.md` | ✅ | ✅ |
| Claude Code | `CLAUDE.md` | ✅ | ✅ |
| Cursor | `.cursor/rules/` | ✅ | ✅ |
| Gemini CLI | `GEMINI.md` | ✅ | ✅ |
| Windsurf | `.windsurfrules` | ✅ | ✅ |
| Codex CLI | `AGENTS.md` | ✅ | ✅ |
| Any MCP host | `.driftlens/rules/` (universal) | ✅ | ✅ |

---

## Install

```bash
npm install -g github:Ashutosh-Panda2004/DriftLens
```

## Setup (30 seconds)

```bash
cd your-project
driftlens init
```

This installs a `post-commit` git hook, creates `.driftlens/`, and registers the MCP prevention server. Code normally.

---

## Usage

```bash
# === OBSERVE (passive, zero friction) ===
driftlens watch start          # begin AI-assisted session
# ... use Claude, Copilot, Cursor, etc. ...
driftlens watch stop           # end session
driftlens mark HEAD            # tag a commit retroactively

# === INTELLIGENCE (the insights no one else provides) ===
driftlens roi                  # AI Productivity Ledger - dollar ROI
driftlens roi --team           # team-level ROI report
driftlens agents               # Agent Quality Matrix - who's best where
driftlens agents --recommend   # best agent for your current project
driftlens health               # Organizational AI Maturity Score
driftlens regression           # detect model update regressions

# === PREVENTION (stop mistakes before they happen) ===
driftlens prevent start        # start MCP prevention server
driftlens predict src/foo.ts   # predicted failures for a file

# === SKILL IMPROVEMENT (enhanced from v1) ===
driftlens analyse              # discover patterns
driftlens propose              # open draft PRs to skill files
driftlens unify                # cross-agent skill audit + propagation
driftlens trim                 # context economics + dead rule removal

# === REPORTING (for managers and leadership) ===
driftlens dashboard            # visual intelligence dashboard
driftlens report --executive   # CTO/VP-level summary (PDF)
driftlens score                # drift score + friction score
```

---

## Example: AI Productivity Ledger

```bash
$ driftlens roi

AI Productivity Ledger - Last 30 Days
─────────────────────────────────────
  TIME SAVED by AI generation:        +47.3 hours
  TIME LOST to corrections:           -12.1 hours
  NET AI PRODUCTIVITY GAIN:           +35.2 hours

  At $85/hr (configured):
    Value generated:   $4,020
    Value destroyed:   -$1,029
    NET ROI:           $2,992 (3.9× return on $769 tool spend)

  TREND: ▲ +14% vs last month (skills improving)

  Per-Agent Breakdown:
    Claude:    +$1,840  (best for: services, auth)
    Copilot:   +$920   (best for: tests, components)
    Cursor:    +$232   (best for: styling, config)
```

## Example: Predictive Prevention

```bash
$ driftlens predict src/features/auth/AuthService.ts

Predicted Failures - AuthService.ts (Risk: HIGH)
────────────────────────────────────────────────
  ⚠️  89% - Will use fetch() instead of service layer
     Constraint: "Use authService singleton from @/services"
  ⚠️  76% - Will import from ../services not @/services
     Constraint: "Always use @/ path alias for imports"
  ⚠️  64% - Will instantiate with new instead of singleton
     Constraint: "Never use new AuthService(), use the singleton export"

  Prevention: 3 constraints auto-injected via MCP server ✓
  Last month: 11 corrections prevented by prediction layer
```

## Example: Agent Quality Matrix

```bash
$ driftlens agents

Agent Quality Matrix - Your Codebase
─────────────────────────────────────
                    Copilot   Claude   Cursor   Gemini
React components:    88%       91%      85%      79%
Service layer:       72%       94%      78%      81%
Database queries:    85%       76%      82%      93%
Test writing:        91%       89%      87%      84%
GraphQL resolvers:   61%       88%      72%      68%

Recommendation for current file (graphql/resolvers/user.ts):
  → Use Claude (88%) instead of Copilot (61%)
  → Potential time saved: ~4.2 min per generation
```

---

## Example

```bash
$ driftlens status

DriftLens Status
────────────────
Total corrections captured: 47
  git_delta:      12
  reprompt:       28
  struggle_chain:  7
  churn:           0

Date range: 2026-05-20 → 2026-06-09

Top files by correction count:
   8  src/features/profile/ProfilePage.tsx
   6  src/services/UserService.ts
   5  src/features/auth/AuthService.ts

Struggle chains: 7
  Average turns per chain: 3.4
  Average friction score:  3.4

$ driftlens analyse
DriftLens Analyse
─────────────────
Analysing 47 corrections...
Embedding corrections...
Clustering by semantic similarity...
Found 3 cluster(s) with ≥3 occurrences
Analysing patterns with LLM...

Found 3 pattern(s) and saved to patterns.json
  [91%] service-layer-enforcement - 14 corrections
  [87%] service-singleton-import - 8 corrections
  [79%] path-alias-usage - 5 corrections

Run: driftlens propose --dry-run  to preview skill updates

$ driftlens propose --dry-run
--- DRY RUN: Would write to CLAUDE.md ---
## Learned Rules

<!-- Added by DriftLens on 2026-06-09. 14 corrections across 3 week(s). Confidence: 0.91. Avg friction: 3.4 turns. -->
- Never call fetch() or axios directly in React components.
  Always use the corresponding service from src/features/[feature]/services/ or @/services.
  ❌ `const data = await fetch('/api/users')`
  ✅ `const data = await userService.getAll()`
```

---

## How It Works

### Layer 0: Observation (multi-signal, passive)
Identifies AI-assisted commits and captures corrections:
- `driftlens watch start/stop` - explicit session bracketing (100% confidence)
- Copilot Agent Hooks, session logs, commit tags, co-author trailers
- **Git delta** - what AI wrote vs what you committed
- **Re-prompt** - your correction instructions from session logs
- **Struggle chains** - multi-turn fights captured as high-signal corrections
- **Timing** - generation→commit timestamps for productivity calculation
- **Agent+Model tracking** - exact model version per generation

### Layer 1: Intelligence Engine (the brain)
- **Productivity Ledger** - time saved vs time lost, dollar ROI per agent
- **Agent Quality Matrix** - per-agent accuracy by file type and module
- **Failure Predictor** - per-file mistake probability model
- **Regression Sentinel** - detects when model updates break patterns
- **Context Economics** - per-rule token cost vs corrections prevented (ROI)
- **Maturity Scorer** - composite organizational AI health metric

### Layer 2: Prevention (real-time, proactive)
- **MCP Server** - serves file-specific constraints to any MCP-compatible agent
- **Context injection** - learned constraints injected before AI generates code
- **Agent Router** - recommends best agent per task context
- Tracks prevention rate: corrections avoided vs corrections that still happened

### Layer 3: Skill Improvement
- Clusters corrections → names patterns → proposes rules
- Creates **draft PRs** via GitHub/GitLab (never silent writes)
- **Cross-agent propagation** - rules propagate to ALL agent formats
- **Stale rule detection** - archives dead-weight rules based on economics
- Never modifies `<!-- LOCKED -->` sections

### Layer 4: Reporting
- Developer dashboard: patterns, predictions, agent scores
- Manager dashboard: team ROI, productivity trends, tool comparison
- Executive reports: maturity scores, budget justification (PDF/email)
- Slack/email digests for recurring updates

---

## Configuration

Created at `.driftlens/config.json` by `driftlens init`:

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

Supported LLM providers: `anthropic`, `openai`, `gemini`, `ollama`  
Supported embedding providers: `voyage`, `openai`, `ollama`

> **Note:** Anthropic does NOT offer an embedding API. Use Voyage AI (recommended), OpenAI, or Ollama for embeddings.

---

## Privacy

- All corrections are stored **locally** in `.driftlens/corrections.jsonl`
- Nothing is sent to external APIs until you explicitly run `driftlens analyse` or `driftlens propose`
- The post-commit hook runs in the background and never blocks your workflow

---

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

---

## License

MIT
