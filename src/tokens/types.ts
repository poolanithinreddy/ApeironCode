export interface TokenBreakdown {
  total: number;
  system: number;
  user: number;
  context: number;
  memory: number;
  tools: number;
  toolResults: number;
  output: number;
  unknown: number;
}

export interface TokenEstimateOptions {
  model?: string;
  charsPerToken?: number;
}
