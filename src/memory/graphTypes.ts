export type MemoryEntityType =
  | 'bug'
  | 'command'
  | 'convention'
  | 'decision'
  | 'dependency'
  | 'error'
  | 'file'
  | 'fix'
  | 'model'
  | 'module'
  | 'plan'
  | 'provider'
  | 'session'
  | 'skill'
  | 'symbol'
  | 'task'
  | 'test'
  | 'user_preference';

export type MemoryEdgeType =
  | 'bug_fixed_by_change'
  | 'command_validates_task'
  | 'convention_applies_to_path'
  | 'decision_affects_module'
  | 'error_occurred_in_file'
  | 'file_imports_file'
  | 'fix_resolved_error'
  | 'plan_generated_changes'
  | 'session_modified_file'
  | 'test_covers_file';

export interface MemoryEntity {
  confidence: number;
  createdAt: string;
  id: string;
  metadata?: Record<string, unknown>;
  name: string;
  observations: string[];
  source: 'agent' | 'cli' | 'import' | 'session' | 'user';
  stale?: boolean;
  tags: string[];
  type: MemoryEntityType;
  updatedAt: string;
}

export interface MemoryEdge {
  confidence: number;
  createdAt: string;
  from: string;
  id: string;
  metadata?: Record<string, unknown>;
  source: 'agent' | 'cli' | 'import' | 'session' | 'user';
  to: string;
  type: MemoryEdgeType;
  updatedAt: string;
}

export interface MemoryGraph {
  edges: MemoryEdge[];
  entities: MemoryEntity[];
  metadata?: {
    compaction?: {
      appliedAt: string;
      maxEntities: number;
      minConfidence: number;
      removedEdges: number;
      removedEntities: number;
      staleDays: number;
      staleMarked: number;
    };
  };
  schemaVersion: 1;
  updatedAt: string;
}

export interface MemorySearchOptions {
  maxAgeDays?: number;
  minConfidence?: number;
  topK: number;
  types?: string[];
}

export interface MemoryFactInput {
  confidence?: number;
  metadata?: Record<string, unknown>;
  name: string;
  observation: string;
  source?: MemoryEntity['source'];
  tags?: string[];
  type: MemoryEntityType;
}

export interface MemoryEdgeInput {
  confidence?: number;
  from: string;
  metadata?: Record<string, unknown>;
  source?: MemoryEdge['source'];
  to: string;
  type: MemoryEdgeType;
}

export interface MemoryRelatedResult {
  edges: MemoryEdge[];
  entity: MemoryEntity;
  reasons: string[];
  score: number;
}

export interface MemoryReviewFinding {
  entityIds: string[];
  message: string;
  severity: 'info' | 'warning';
  type: 'duplicate' | 'secret' | 'stale' | 'conflict';
}
