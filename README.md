# tchen-skills

A collection of custom Claude Code skills by Tian Chen.

## Installation

```bash
/plugin install tchen-skills@tchen-skills
```

Or browse in `/plugin > Discover` after adding the marketplace.

### Add marketplace (if not already added)

In `~/.claude/settings.json`, add under `extraKnownMarketplaces`:

```json
{
  "tchen-skills": {
    "source": {
      "source": "github",
      "repo": "tyrchen/claude-skills"
    }
  }
}
```

## Available Skills

| Skill | Description |
|-------|-------------|
| **ai-image** | Generate AI images using OpenAI's gpt-image-1 with customizable aspect ratios and artistic themes (Ghibli, futuristic, Pixar, oil painting, Chinese painting) |
| **cel** | Write production-ready CEL expressions for Kubernetes ValidatingAdmissionPolicies, CRD validation rules, and security policies |
| **chat-history** | Extract and organize Claude Code session history into a project `.chats` directory |
| **codex-code-review** | Perform comprehensive code reviews using OpenAI Codex CLI for staged changes, files, directories, or git diffs |
| **council** | Council (智囊团): Distill real-world thinking frameworks into Advisor personas and run multi-Advisor roundtable discussions |
| **design-guide** | Extract comprehensive design language from websites including colors, typography, animations, component patterns, and UX behaviors |
| **kro-rgd** | Create production-ready KRO ResourceGraphDefinitions using Pulumi TypeScript for custom Kubernetes APIs and AWS ACK integration |
| **surrealdb** | Write production-ready SurrealDB queries and operations using SurrealQL for document, graph, and relational patterns |

## Plugin Structure

```
claude-skills/
├── .claude-plugin/
│   └── marketplace.json    # Plugin marketplace metadata
├── ai-image/
│   └── SKILL.md
├── cel/
│   └── SKILL.md
├── chat-history/
│   └── SKILL.md
├── codex-code-review/
│   └── SKILL.md
├── council/
│   └── SKILL.md
├── design-guide/
│   └── SKILL.md
├── kro-rgd/
│   └── SKILL.md
├── surrealdb/
│   └── SKILL.md
└── README.md
```

## License

MIT
