# Ollama Quickstart

```bash
ollama serve
ollama pull qwen2.5-coder:7b
apeironcode config set provider ollama
apeironcode config set model qwen2.5-coder:7b
apeironcode doctor --provider
apeironcode "explain this repo"
```