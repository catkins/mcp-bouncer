import { z } from 'zod';

export const TransportTypeSchema = z.enum(['stdio', 'sse', 'streamable_http']);

export const MCPServerConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  transport: TransportTypeSchema
    .or(z.literal(''))
    .nullable()
    .optional()
    .transform((v) => (v === '' || v == null ? undefined : v)),
  command: z.string(),
  args: z
    .array(z.string())
    .nullable()
    .optional()
    .transform((v) => (v == null ? undefined : v)),
  env: z
    .record(z.string())
    .nullable()
    .optional()
    .transform((v) => (v == null ? undefined : v)),
  endpoint: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v == null ? undefined : v)),
  headers: z
    .record(z.string())
    .nullable()
    .optional()
    .transform((v) => (v == null ? undefined : v)),
  requires_auth: z
    .boolean()
    .nullable()
    .optional()
    .transform((v) => (v == null ? undefined : v)),
  enabled: z.boolean(),
});

export const SettingsSchema = z.object({
  mcp_servers: z.array(MCPServerConfigSchema),
  listen_addr: z.string(),
});

export const ClientStatusSchema = z.object({
  name: z.string(),
  state: z.enum(['disconnected', 'connecting', 'errored', 'connected', 'requires_authorization', 'authorizing']),
  tools: z.number(),
  last_error: z.string().optional(),
  authorization_required: z.boolean(),
  oauth_authenticated: z.boolean(),
});

export const IncomingClientSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  title: z.string().optional(),
  connected_at: z.union([z.string(), z.date(), z.null()]).optional(),
});

export const ToolSchema = z.object({
  name: z.string(),
  description: z.string().optional().default(''),
  inputSchema: z.unknown().optional(),
}).transform((v) => ({
  // normalize potential casing differences from backend: inputSchema/input_schema
  ...v,
}));

export type TransportType = z.infer<typeof TransportTypeSchema>;
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type ClientStatus = z.infer<typeof ClientStatusSchema>;
export type IncomingClient = z.infer<typeof IncomingClientSchema>;
export type Tool = z.infer<typeof ToolSchema>;
