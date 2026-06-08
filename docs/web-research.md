# Web Research

ApeironCode Agent exposes three built-in web tools:

- `web_fetch`
  Fetch a direct `http:` or `https:` URL and return cleaned text content.

- `web_search`
  Query a configured web search provider and return result titles, URLs, and snippets.

- `web_research`
  Build a short source-backed brief from live search results.

## Commands

CLI:

```bash
apeironcode web fetch https://example.com/spec
apeironcode web search "parser design patterns"
apeironcode web research "JSON-RPC retry strategy"
```

Slash commands:

```text
/web fetch https://example.com/spec
/web search parser design patterns
/web research JSON-RPC retry strategy
```

## Safety Model

- Web access is ask-first by default.
  The tools declare their outbound targets and the unified tool executor evaluates `Network(...)` rules before the request is sent.

- `file://` is blocked.
  `web_fetch` only accepts `http:` and `https:` URLs.

- `localhost` and private IP ranges are blocked by default.
  Literal private addresses such as `127.0.0.1`, `10.x.x.x`, `192.168.x.x`, and `172.16.x.x` through `172.31.x.x` are rejected unless you explicitly opt in.

- Query sanitization runs before search requests leave the process.
  Obvious secret-like fragments such as `api_key=...`, bearer tokens, or common API key formats are redacted before the search URL is built.

- Audit logging still applies.
  The executor records tool and network permission decisions, including whether access was allowed, denied, or approved interactively.

## Configuration

Project config example:

```json
{
  "web": {
    "enabled": true,
    "searchProvider": "duckduckgo",
    "maxFetchChars": 6000,
    "maxSearchResults": 5,
    "allowPrivateHosts": false,
    "userAgent": "ApeironCode-Agent/0.1"
  },
  "permissions": [
    "Allow(Network(https://duckduckgo.com/*))"
  ]
}
```

Current settings:

- `web.enabled`
  Enables the built-in web tools. If disabled, the tools fail with a clear runtime error.

- `web.searchProvider`
  Currently supports `duckduckgo` only. An empty or unsupported value returns a setup-oriented error instead of a vague failure.

- `web.maxFetchChars`
  Limits the cleaned text returned by `web_fetch`.

- `web.maxSearchResults`
  Caps the number of parsed search results.

- `web.allowPrivateHosts`
  Defaults to `false`. Set this only for trusted local testing, for example when targeting a mocked local HTTP server in development or test fixtures.

- `web.userAgent`
  Sets the request `User-Agent` header for outbound requests.

## Network Rules

Examples:

```text
Allow(Network(https://duckduckgo.com/*))
Allow(Network(https://example.com/*))
Deny(Network(http://127.0.0.1:*))
```

Important details:

- `Deny(...)` wins over `Allow(...)`.
- No matching `Network(...)` rule falls back to an approval prompt.
- Tool rules alone are not enough for outbound access. Allowing `Tool(web_fetch)` without allowing the matching `Network(...)` target still results in ask-first or deny behavior.

## Direct URL Fetches

`web_fetch` is for direct URL reads. That makes it useful for:

- specifications and RFC pages
- project documentation pages
- public issue or release notes pages
- locally mocked HTTP servers during tests when `web.allowPrivateHosts=true`

It is not a browser automation layer. It does not execute JavaScript or render authenticated sessions.

## Privacy and Limitations

- Search and research queries are sanitized, not fully anonymized.
  Do not intentionally paste secrets into web queries.

- Result extraction is best-effort HTML parsing.
  Pages with heavy client-side rendering or unusual markup may produce incomplete text.

- Search provider support is currently limited to `duckduckgo`.

- The tools do not crawl multiple hops, follow browser workflows, or maintain cookies.

- Tests do not require the real internet.
  The repo covers web behavior with mocked fetches and a mocked local HTTP server behind an explicit private-host override.