import {Box, Text} from 'ink';
import React from 'react';

import type {TodoItem} from '../agent/types.js';

interface TodoPanelProps {
  todos: TodoItem[];
}

const statusColor = (status: TodoItem['status']): 'gray' | 'green' | 'red' | 'yellow' => {
  switch (status) {
    case 'completed':
      return 'green';
    case 'failed':
      return 'red';
    case 'running':
      return 'yellow';
    default:
      return 'gray';
  }
};

export const TodoPanel = ({todos}: TodoPanelProps) => {
  if (todos.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan">Plan</Text>
      {todos.map((todo) => (
        <Text key={todo.id} color={statusColor(todo.status)}>
          [{todo.status}] {todo.content}
        </Text>
      ))}
    </Box>
  );
};