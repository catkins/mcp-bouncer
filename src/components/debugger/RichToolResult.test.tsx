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
});
