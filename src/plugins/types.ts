import {z} from 'zod';

export const PluginToolManifestSchema = z.object({
  description: z.string().optional(),
  name: z.string().min(1),
  permissions: z.array(z.string()).default([]),
});

export const PluginPromptManifestSchema = z.object({
  description: z.string().optional(),
  name: z.string().min(1),
  template: z.string().min(1),
});

export const PluginMcpServerSchema = z.discriminatedUnion('type', [
  z.object({
    args: z.array(z.string()).default([]),
    command: z.string().min(1),
    env: z.record(z.string()).default({}),
    name: z.string().min(1),
    type: z.literal('stdio'),
  }),
  z.object({
    headers: z.record(z.string()).default({}),
    name: z.string().min(1),
    type: z.literal('http'),
    url: z.string().url(),
  }),
  z.object({
    headers: z.record(z.string()).default({}),
    name: z.string().min(1),
    type: z.literal('sse'),
    url: z.string().url(),
  }),
]);

export const PluginManifestSchema = z.object({
  description: z.string().optional(),
  mcpServers: z.array(PluginMcpServerSchema).default([]),
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
  permissions: z.array(z.string()).default([]),
  prompts: z.array(PluginPromptManifestSchema).default([]),
  schemaVersion: z.literal(1).default(1),
  tools: z.array(PluginToolManifestSchema).default([]),
  version: z.string().min(1),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;
export type PluginMcpServer = z.infer<typeof PluginMcpServerSchema>;

export interface LoadedPluginManifest {
  directory: string;
  enabled: boolean;
  errors: string[];
  filePath: string;
  manifest: PluginManifest;
}
