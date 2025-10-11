import { useMemo } from 'react';
import { HighlightedJson } from '../logs/HighlightedJson';

interface ToolContentBase {
  type: string;
  [key: string]: unknown;
}

interface ToolTextContent extends ToolContentBase {
  type: 'text';
  text: string;
}

interface ToolImageContent extends ToolContentBase {
  type: 'image';
  data?: string;
  mimeType?: string;
  uri?: string;
  alt?: string;
}

interface ToolAudioContent extends ToolContentBase {
  type: 'audio';
  data?: string;
  mimeType?: string;
  uri?: string;
  title?: string;
}

interface ToolResourceLinkContent extends ToolContentBase {
  type: 'resource_link';
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

interface ToolEmbeddedResourceContent extends ToolContentBase {
  type: 'resource';
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
    title?: string;
    name?: string;
    description?: string;
  };
}

type ToolContentItem =
  | ToolTextContent
  | ToolImageContent
  | ToolAudioContent
  | ToolResourceLinkContent
  | ToolEmbeddedResourceContent
  | ToolContentBase;

interface RichToolResultProps {
  result: any;
}

export function RichToolResult({ result }: RichToolResultProps) {
  const prepared = useMemo(() => normalizeResult(result), [result]);

  if (!prepared) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border border-surface-200/80 bg-white/90 p-4 text-sm text-surface-600 shadow-sm dark:border-surface-800/60 dark:bg-surface-900/70 dark:text-surface-300">
        Tool result did not include any renderable content.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      {prepared.content.length > 0 ? (
        <div className="flex flex-col gap-3">
          {prepared.content.map((item, index) => (
            <ContentCard key={index} item={item} />
          ))}
        </div>
      ) : null}

      {prepared.structured ? (
        <div className="rounded-xl border border-surface-200/80 bg-white/90 p-3 shadow-sm transition-colors dark:border-surface-800/60 dark:bg-surface-900/70">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-surface-600 dark:text-surface-300">
            Structured Content
          </h4>
          <HighlightedJson value={prepared.structured} className="mt-2" />
        </div>
      ) : null}
    </div>
  );
}

function ContentCard({ item }: { item: ToolContentItem }) {
  switch (item.type) {
    case 'text': {
      const textContent = (item as ToolTextContent).text;
      const parsedJson = parseJsonText(textContent);
      return (
        <div className="rounded-xl border border-surface-200/80 bg-white/90 p-3 shadow-sm transition-colors dark:border-surface-800/60 dark:bg-surface-900/70">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-surface-600 dark:text-surface-300">Text</h4>
          {parsedJson ? (
            <HighlightedJson value={parsedJson} className="mt-2" />
          ) : (
            <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-surface-800 dark:text-surface-100">
              {textContent}
            </pre>
          )}
        </div>
      );
    }
    case 'image':
      return <ImageCard item={item as ToolImageContent} />;
    case 'audio':
      return <AudioCard item={item as ToolAudioContent} />;
    case 'resource_link':
      return <ResourceLinkCard item={item as ToolResourceLinkContent} />;
    case 'resource':
      return <EmbeddedResourceCard item={item as ToolEmbeddedResourceContent} />;
    default:
      return (
        <div className="rounded-lg border border-gray-200 bg-white/90 p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900/60">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Unsupported Content ({item.type ?? 'unknown'})
          </h4>
          <HighlightedJson
            value={item}
            className="mt-2 overflow-auto rounded-md border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
          />
        </div>
      );
  }
}

function ImageCard({ item }: { item: ToolImageContent }) {
  const source = buildMediaSource(item.data, item.mimeType, item.uri);
  return (
    <div className="rounded-lg border border-gray-200 bg-white/90 p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900/60">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Image</h4>
        {item.mimeType ? (
          <span className="text-[11px] uppercase tracking-wide text-gray-400">{item.mimeType}</span>
        ) : null}
      </div>
      {source ? (
        <img
          src={source}
          alt={typeof item.alt === 'string' ? item.alt : 'Tool result image'}
          className="max-h-72 w-auto rounded-md border border-gray-200 object-contain dark:border-gray-700"
        />
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-300">Image data was not provided.</p>
      )}
      {item.uri && !item.data ? (
        <a
          href={item.uri}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
        >
          Open image
        </a>
      ) : null}
    </div>
  );
}

function AudioCard({ item }: { item: ToolAudioContent }) {
  const source = buildMediaSource(item.data, item.mimeType, item.uri);
  return (
    <div className="rounded-xl border border-surface-200/80 bg-white/90 p-3 shadow-sm transition-colors dark:border-surface-800/60 dark:bg-surface-900/70">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">Audio</h4>
        {item.mimeType ? (
          <span className="text-[11px] uppercase tracking-wide text-surface-400">{item.mimeType}</span>
        ) : null}
      </div>
      {source ? (
        <audio controls className="w-full">
          <source src={source} type={item.mimeType ?? undefined} />
          Your browser does not support the audio element.
        </audio>
      ) : (
        <p className="text-sm text-surface-500 dark:text-surface-300">Audio data was not provided.</p>
      )}
      {item.title ? <p className="mt-2 text-xs text-surface-500 dark:text-surface-400">{item.title}</p> : null}
    </div>
  );
}

function ResourceLinkCard({ item }: { item: ToolResourceLinkContent }) {
  return (
    <div className="rounded-xl border border-brand-200/70 bg-brand-50/70 p-3 shadow-sm transition-colors dark:border-brand-900/40 dark:bg-brand-900/20">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">Resource Link</h4>
      <a
        href={item.uri}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline dark:text-brand-200"
      >
        {item.name ?? item.uri}
      </a>
      {item.description ? (
        <p className="mt-1 text-xs text-brand-700/70 dark:text-brand-200/70">{item.description}</p>
      ) : null}
      {item.mimeType ? (
        <p className="mt-1 text-[11px] uppercase tracking-wide text-brand-500/70 dark:text-brand-300/70">
          {item.mimeType}
        </p>
      ) : null}
    </div>
  );
}

function EmbeddedResourceCard({ item }: { item: ToolEmbeddedResourceContent }) {
  const { resource } = item;
  const hasText = typeof resource.text === 'string' && resource.text.length > 0;
  const parsedResourceJson = hasText ? parseJsonText(resource.text as string) : null;
  const hasBlob = typeof resource.blob === 'string' && resource.blob.length > 0;
  const blobLength = hasBlob ? (resource.blob as string).length : 0;

  return (
    <div className="rounded-xl border border-brand-200/70 bg-brand-50/70 p-3 shadow-sm transition-colors dark:border-brand-900/40 dark:bg-brand-900/20">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">
        Embedded Resource
      </h4>
      <div className="mt-1 text-sm font-medium text-brand-700 dark:text-brand-200">
        {resource.title ?? resource.name ?? resource.uri}
      </div>
      <p className="text-xs text-brand-700/70 dark:text-brand-200/70">{resource.uri}</p>
      {resource.mimeType ? (
        <p className="mt-1 text-[11px] uppercase tracking-wide text-brand-500/70 dark:text-brand-300/70">
          {resource.mimeType}
        </p>
      ) : null}
      {resource.description ? (
        <p className="mt-2 text-xs text-brand-700/80 dark:text-brand-200/80">{resource.description}</p>
      ) : null}
      {hasText ? (
        parsedResourceJson ? (
          <HighlightedJson value={parsedResourceJson} className="mt-3" />
        ) : (
          <pre className="mt-3 max-h-48 overflow-auto rounded-md bg-brand-900/10 p-3 text-xs text-brand-900 dark:bg-brand-200/10 dark:text-brand-100">
            {resource.text}
          </pre>
        )
      ) : null}
      {hasBlob ? (
        <p className="mt-3 text-xs text-brand-700 dark:text-brand-200">
          Binary data ({blobLength} bytes base64-encoded)
        </p>
      ) : null}
    </div>
  );
}

function buildMediaSource(data?: string, mimeType?: string, uri?: string) {
  if (data && typeof data === 'string' && data.length > 0) {
    const prefix = mimeType ? `${mimeType}` : 'application/octet-stream';
    return `data:${prefix};base64,${data}`;
  }
  if (uri && typeof uri === 'string' && uri.length > 0) {
    return uri;
  }
  return null;
}

function normalizeResult(result: unknown): { content: ToolContentItem[]; structured?: unknown } | null {
  if (!result || typeof result !== 'object') return null;
  const record = result as Record<string, unknown>;
  const rawContent = Array.isArray(record.content) ? (record.content as ToolContentItem[]) : [];
  const structured = record.structuredContent ?? record.data ?? undefined;

  if (rawContent.length === 0 && structured == null) {
    return null;
  }

  return {
    content: rawContent,
    structured,
  };
}

function parseJsonText(text: string | undefined): unknown | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const startsLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  if (!startsLikeJson) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
