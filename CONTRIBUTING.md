# Contributing to Kognai

Thank you for your interest in contributing to Kognai.

## How Kognai Works

Kognai is built by an AI agent swarm. Most code is written by agents via sprint execution. Human contributions are welcome for:

- Bug reports and feature requests (GitHub Issues)
- Documentation improvements
- Agent config enhancements
- Skill contributions (OpenClaw skills)
- Integration development

## Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run the relevant validation scripts
5. Commit with a descriptive message
6. Open a Pull Request

## Code Style

- TypeScript for pipeline code and Telegram commands
- Python for dashboard, model router, and analytics
- Agent configs use YAML + Markdown (prompt.md)
- Keep files under 200 lines where possible

## Sprint Conventions

- Sprint files: `workspace/sprints/sprint-NNN.json`
- Commit messages: `Sprint NNN: [BLOCK] -- description`
- State updates: `state: update after Sprint NNN`

## Security

- Never commit `.env` files or API keys
- Safety constraints must be in code (Summer Yu rule), not chat-only
- Report security issues via GitHub Issues (private)

## Questions?

Open a GitHub Issue or reach out via the project's Telegram bot.
