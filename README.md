# Obsidian

Obsidian is an experimental local application for structured, multi-step LLM workflows. It combines a React interface with an Express API, supports Gemini and DeepSeek providers, and includes a session library and an optional task-planning and execution harness.

The project is a research prototype. Its generated analysis is not guaranteed to be accurate, and the execution harness can modify files and run shell commands.

## Features

- Run multi-step thinking sessions across defined reasoning dimensions.
- Switch between Gemini and DeepSeek providers and configure API keys through environment variables.
- Save and revisit sessions, inspect reasoning graphs, and view prompt-memory entries.
- Plan tasks as dependency graphs and stream worker, manager, and execution events to the interface.
- Review job status and logs through the local API.

## Requirements

- Node.js 20 or later
- An API key for Gemini or DeepSeek

## Run locally

```bash
git clone https://github.com/Gifted87/obsidian.git
cd obsidian
npm ci
cp .env.example .env
```

Edit `.env` and replace the example values. Set `AI_PROVIDER` to `gemini` or `deepseek`, then provide the matching `GEMINI_API_KEY` or `DEEPSEEK_API_KEY`. For key rotation, use the corresponding comma-separated `GEMINI_API_KEYS` or `DEEPSEEK_API_KEYS` setting.

Start the API and frontend in separate terminals:

```bash
npm run server
```

```bash
npm run dev
```

Open <http://localhost:3000>. The API listens on port `3030`.

## Project layout

- `src/` — React interface, provider clients, reasoning workflow, and execution agents
- `server.ts` — Express API for thinking sessions, session storage, and execution jobs
- `documentation.md` — detailed architecture notes
- `memory/` — local session, execution, and prompt-memory data

## Security and data handling

The server currently binds to `0.0.0.0`, enables unrestricted CORS, and does not authenticate API requests. The execution harness can run shell commands and read or write files in its configured working directory. Run it only in a trusted, isolated development environment; do not expose it to the public internet or an untrusted network.

API keys belong in the ignored `.env` file. Never commit real credentials. The `memory/` directory can contain prompts, task details, generated reports, and file paths; review and keep personal session data out of public commits.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
