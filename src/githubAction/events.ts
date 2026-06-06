import {readFile} from 'node:fs/promises';
import {parseGitHubWebhookPayload, type GitHubWebhookContext} from '../connectors/github/webhooks.js';

export interface GitHubActionEvent {
  context: GitHubWebhookContext;
  eventName: string;
  payload: unknown;
}

export const loadActionEvent = async (
  env: Record<string, string | undefined> = process.env,
): Promise<GitHubActionEvent | null> => {
  const eventName = env.GITHUB_EVENT_NAME;
  const eventPath = env.GITHUB_EVENT_PATH;
  if (!eventName || !eventPath) {
    return null;
  }
  let raw: string;
  try {
    raw = await readFile(eventPath, 'utf-8');
  } catch {
    return null;
  }
  return parseRawActionEvent(eventName, raw);
};

export const parseRawActionEvent = (eventName: string, payload: string | object): GitHubActionEvent => {
  const data = typeof payload === 'string' ? safeParseJson(payload) : payload;
  return {
    context: parseGitHubWebhookPayload(data, eventName),
    eventName,
    payload: data,
  };
};

const safeParseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
