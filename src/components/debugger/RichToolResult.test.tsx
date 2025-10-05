import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { RichToolResult } from './RichToolResult';

describe('RichToolResult', () => {
  afterEach(() => {
    cleanup();
  });

  it('pretty prints JSON text content with syntax highlighting', () => {
    render(
      <RichToolResult
        result={{
          content: [
            {
              type: 'text',
              text: '{"foo": "bar"}',
            },
          ],
        }}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'Text' });
    const card = heading.parentElement as HTMLElement;
    expect(card.querySelector('pre.prism-code')).not.toBeNull();
    expect(card.querySelector('pre.whitespace-pre-wrap')).toBeNull();
  });

  it('falls back to plain text when content is not JSON', () => {
    render(
      <RichToolResult
        result={{
          content: [
            {
              type: 'text',
              text: 'just plain text',
            },
          ],
        }}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'Text' });
    const card = heading.parentElement as HTMLElement;
    expect(card.querySelector('pre.whitespace-pre-wrap')).not.toBeNull();
    expect(card.querySelector('pre.prism-code')).toBeNull();
  });

  it('renders structured content with syntax highlighting', () => {
    render(
      <RichToolResult
        result={{
          content: [],
          structuredContent: {
            foo: 'bar',
          },
        }}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'Structured Content' });
    const container = heading.parentElement as HTMLElement;
    expect(container.querySelector('pre.prism-code')).not.toBeNull();
  });

  it('renders unsupported content with syntax highlighting', () => {
    render(
      <RichToolResult
        result={{
          content: [
            {
              type: 'custom_payload',
              hello: 'world',
            },
          ],
        }}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'Unsupported Content (custom_payload)' });
    const container = heading.parentElement as HTMLElement;
    expect(container.querySelector('pre.prism-code')).not.toBeNull();
  });
});
