import { describe, it, expect } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider, useToast } from './ToastContext';

function Harness() {
  const { toasts, addToast, removeToast } = useToast();
  return (
    <div>
      <button id="add" onClick={() => addToast({ type: 'info', title: 't' })} />
      <button id="rm" onClick={() => toasts[0] && removeToast(toasts[0].id)} />
      <div id="count">{toasts.length}</div>
    </div>
  );
}

describe('ToastContext', () => {
  it('adds and removes toasts', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    root.render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

    const add = container.querySelector('#add') as HTMLButtonElement;
    const rm = container.querySelector('#rm') as HTMLButtonElement;
    const count = () => container.querySelector('#count')!.textContent;

    add.click();
    expect(count()).toBe('1');
    rm.click();
    expect(count()).toBe('0');
  });
});

