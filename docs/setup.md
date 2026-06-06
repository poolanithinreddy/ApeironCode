# Setup

Start without an API key:

```bash
apeironcode setup --provider mock
apeironcode setup status
apeironcode
```

The mock provider is deterministic and intended for trying the product, demos, tests, and CI-style flows. It does not call a paid model.

Use Ollama locally:

```bash
apeironcode setup --local
ollama serve
ollama pull qwen2.5-coder:7b
```

Use a cloud provider:

```bash
export OPENROUTER_API_KEY=...
apeironcode setup --provider openrouter
```

Setup writes normal user configuration under `.apeironcode-agent/config.json` in your home directory. It does not store raw API keys; cloud providers read keys from environment variables.

Reset preview:

```bash
apeironcode setup reset --dry-run
```

