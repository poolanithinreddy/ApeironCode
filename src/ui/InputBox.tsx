import {Box, Text} from 'ink';
import TextInput from 'ink-text-input';
import React, {useRef} from 'react';

interface InputBoxProps {
  disabled?: boolean;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

/**
 * Phase 17G: a pasted multi-line prompt used to be truncated because
 * `extractSubmittedInput` sliced at the first newline. Now:
 *  - return `null` while the user is still composing (no trailing newline).
 *  - submit the full value (with internal newlines preserved) only when a
 *    trailing newline is present.
 * This keeps the one-line UX (Enter submits) while letting pasted multi-line
 * content reach the runtime intact.
 */
export const extractSubmittedInput = (value: string): string | null => {
  if (!/[\r\n]$/u.test(value)) {
    return null;
  }
  // Normalize CRLF → LF, strip only trailing newlines, preserve internal ones.
  const normalized = value.replace(/\r\n?/gu, '\n').replace(/\n+$/u, '');
  const trimmed = normalized.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const InputBox = ({
  disabled = false,
  onChange,
  onSubmit,
  placeholder = 'Ask or type /commands',
  value,
}: InputBoxProps) => {
  const lastSubmittedRef = useRef<{time: number; value: string} | null>(null);
  const submit = (rawValue: string) => {
    // Preserve internal newlines (multi-line paste). Only trim the outer
    // whitespace and normalize CRLF so the runtime always receives the same
    // line endings.
    const normalized = rawValue.replace(/\r\n?/gu, '\n').trim();
    if (!normalized) {
      onChange('');
      return;
    }
    const now = Date.now();
    if (lastSubmittedRef.current?.value === normalized && now - lastSubmittedRef.current.time < 100) {
      lastSubmittedRef.current = null;
      return;
    }
    lastSubmittedRef.current = {time: now, value: normalized};
    onChange('');
    onSubmit(normalized);
  };

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor={disabled ? 'gray' : 'green'} paddingX={1}>
        <Text color="green">› </Text>
        <TextInput
          value={value}
          placeholder={placeholder}
          onChange={(nextValue) => {
            const submitted = extractSubmittedInput(nextValue);
            if (submitted !== null) {
              submit(submitted);
              return;
            }
            onChange(nextValue);
          }}
          onSubmit={submit}
          focus={!disabled}
        />
      </Box>
      <Text dimColor>{disabled ? 'Working...' : 'Enter submits | /commands opens help | /dashboard returns home'}</Text>
    </Box>
  );
};
