// DriftLens - Default values, version, and well-known paths

export const VERSION = '0.2.0';

export const DRIFTLENS_DIR = '.driftlens';
export const CORRECTIONS_FILE = '.driftlens/corrections.jsonl';
export const SESSIONS_FILE = '.driftlens/sessions.jsonl';
export const PATTERNS_FILE = '.driftlens/patterns.json';
export const FEEDBACK_FILE = '.driftlens/feedback.json';
export const CONFIG_FILE = '.driftlens/config.json';
export const MARKED_COMMITS_FILE = '.driftlens/marked-commits.jsonl';
export const PROPOSALS_FILE = '.driftlens/proposals.jsonl';
export const PREVENTION_FILE = '.driftlens/prevention.jsonl';
export const REGISTRY_FILE = '.driftlens/registry.json';
export const META_PATTERNS_FILE = '.driftlens/meta-patterns.json';
export const CONTRADICTIONS_FILE = '.driftlens/contradictions.json';
export const RULE_LEDGER_FILE = '.driftlens/rule-ledger.json';

export const DEFAULT_DETECTION_CONFIG = {
  methods: ['watch', 'agent_hooks', 'session_logs', 'commit_tags', 'co_author'],
  minConfidence: 0.70,
  sessionLogWindowMinutes: 5,
  fallbackTagPrefix: '[ai]',
  commitTagPatterns: ['[ai]', '[copilot]', '[claude]', '[cursor]', '[agent]'],
} as const;

export const DEFAULT_ANALYSIS_CONFIG = {
  minOccurrences: 3,
  minConfidence: 0.75,
  clusteringThreshold: 0.82,
} as const;

export const DEFAULT_DASHBOARD_CONFIG = {
  port: 3847,
  openBrowser: true,
} as const;

export const SKILL_FILE_PATTERNS: Record<string, string[]> = {
  copilot: ['.github/skills'],
  claude: ['CLAUDE.md'],
  cursor: ['.cursor/rules'],
  gemini: ['GEMINI.md'],
  windsurf: ['.windsurfrules'],
  codex: ['AGENTS.md'],
};

export const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.c': 'c',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.sh': 'bash',
  '.md': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

export const CORRECTION_KEYWORDS = [
  'no,', 'nope', 'wrong', 'incorrect', 'don\'t', 'dont', 'instead',
  'use', 'change', 'fix', 'replace', 'should', 'must', 'never',
  'always', 'actually', 'wait', 'stop', 'that\'s not', 'thats not',
  'not like that', 'not that way',
];

export const APPROVAL_KEYWORDS = [
  'looks good', 'lgtm', 'perfect', 'great', 'ship it', 'commit',
  'that\'s right', 'correct', 'yes', 'yep', 'approved', 'nice',
];

export const CLARIFICATION_KEYWORDS = [
  'what does', 'what is', 'how does', 'explain', 'why did', 'can you explain',
  'what\'s the', 'tell me',
];

// ─── Correction Reason Taxonomy (E-C1) ────────────────────────────────────────
// Keyword signals used by the rule-based reason classifier. The LLM path can
// refine these, but every correction is guaranteed a reason (falling back to
// 'other') so downstream prioritisation and reporting never see an empty value.

export const REASON_KEYWORDS: Record<string, string[]> = {
  security: [
    'security', 'vulnerab', 'injection', 'sanitize', 'sanitise', 'escape', 'xss',
    'csrf', 'auth', 'authentication', 'authorization', 'authorisation', 'secret',
    'credential', 'token', 'password', 'encrypt', 'permission', 'sql injection',
    'unsafe', 'eval', 'rce', 'cve', 'owasp',
  ],
  performance: [
    'performance', 'slow', 'optimi', 'cache', 'caching', 'memory leak', 'memoize',
    'n+1', 'batch', 'latency', 'throughput', 'o(n', 'complexity', 'lazy', 'debounce',
    'throttle', 'index', 'expensive',
  ],
  architecture: [
    'service layer', 'architecture', 'separation of concerns', 'coupling', 'boundary',
    'layer', 'module', 'dependency', 'inject', 'abstraction', 'pattern', 'decouple',
    'repository', 'domain', 'use case', 'controller', 'directly call', 'go through',
  ],
  testing: [
    'test', 'spec', 'mock', 'stub', 'assert', 'coverage', 'fixture', 'snapshot',
    'unit test', 'integration test', 'e2e',
  ],
  naming: [
    'rename', 'naming', 'name it', 'call it', 'convention', 'camelcase', 'snake_case',
    'kebab', 'pascalcase', 'should be named', 'better name',
  ],
  'api-misuse': [
    'api', 'wrong method', 'deprecated', 'use the', 'should use', 'correct method',
    'parameter', 'argument', 'signature', 'return type', 'wrong function', 'sdk',
    'library', 'import from',
  ],
  style: [
    'style', 'format', 'lint', 'prettier', 'indent', 'spacing', 'semicolon', 'quotes',
    'eslint', 'whitespace', 'trailing', 'consistent',
  ],
  correctness: [
    'bug', 'wrong', 'incorrect', 'broken', 'fix', 'error', 'crash', 'null', 'undefined',
    'edge case', 'off by one', 'logic', 'race condition', 'does not work', 'fails',
    'exception', 'throw', 'handle',
  ],
};

// Ordered by priority — when multiple reasons match, the first wins as dominant.
export const REASON_PRIORITY: string[] = [
  'security',
  'correctness',
  'performance',
  'architecture',
  'api-misuse',
  'testing',
  'naming',
  'style',
  'other',
];
