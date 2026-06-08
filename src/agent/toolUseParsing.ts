import {repairToolInputJson} from './toolInputRepair.js';

export const parseToolUseInput = (
  toolUse: {input: string; name: string},
): {errorMessage?: string; parsedInput?: unknown; repairWarnings?: string[]} => {
  let parsed: unknown;
  let repairWarnings: string[] | undefined;
  try {
    parsed = JSON.parse(toolUse.input);
  } catch {
    const repair = repairToolInputJson(toolUse.input);
    if (repair.unrecoverable) {
      return {
        errorMessage: `Tool call format error for ${toolUse.name}: invalid JSON in tool input. Re-emit the tool call with valid JSON only.`,
      };
    }
    try {
      parsed = JSON.parse(repair.json);
      repairWarnings = repair.warnings;
    } catch {
      return {
        errorMessage: `Tool call format error for ${toolUse.name}: invalid JSON in tool input. Re-emit the tool call with valid JSON only.`,
      };
    }
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'input' in parsed) {
    const wrapped = parsed as {input: unknown; name?: unknown; toolName?: unknown};
    const wrappedName = typeof wrapped.toolName === 'string'
      ? wrapped.toolName
      : typeof wrapped.name === 'string'
        ? wrapped.name
        : undefined;
    if (wrappedName && wrappedName !== toolUse.name) {
      return {
        errorMessage: `Tool call format error for ${toolUse.name}: payload declared ${wrappedName} instead. Re-emit the tool call with a matching tool name and valid JSON only.`,
      };
    }
    return {parsedInput: wrapped.input, repairWarnings};
  }
  return {parsedInput: parsed, repairWarnings};
};
