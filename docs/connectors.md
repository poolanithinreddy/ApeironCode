# Connectors

Connectors are opt-in integrations with external systems. They follow these rules:

- Tokens come from environment variables only.
- Raw tokens are never printed.
- Read actions are separated from write/comment/create actions.
- Destructive or publishing actions require explicit approval.
- No background sync runs unless configured.

Implemented foundation:

- Connector registry.
- Permission labels.
- GitHub connector status.
- GitHub repo detection from `origin`.

Future connector stubs:

- GitLab
- Jira
- Linear
- Notion
- Slack
- Google Drive docs
