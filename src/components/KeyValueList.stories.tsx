import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { KeyValueList } from './KeyValueList';

const meta: Meta<typeof KeyValueList> = {
  title: 'Components/KeyValueList',
  component: KeyValueList,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'HTTP Headers',
    items: {
      Accept: 'application/json',
      Authorization: 'Bearer token',
    },
    keyPlaceholder: 'Header',
    valuePlaceholder: 'Value',
    ariaLabelBase: 'HTTP header',
    onAdd: () => {},
    onUpdate: () => {},
    onRemove: () => {},
  },
};

export const Interactive: Story = {
  render: () => {
    const [items, setItems] = React.useState<Record<string, string>>({
      FOO: 'bar',
    });
    return (
      <div style={{ maxWidth: 720 }}>
        <KeyValueList
          label="Environment Variables"
          items={items}
          keyPlaceholder="Variable"
          valuePlaceholder="Value"
          ariaLabelBase="Environment variable"
          onAdd={() => setItems(prev => ({ ...prev, NEW: '' }))}
          onUpdate={(index, oldKey, newKey, value) => {
            const entries = Object.entries(items);
            entries[index] = [newKey, value];
            const next: Record<string, string> = {};
            for (const [k, v] of entries) next[k] = v;
            setItems(next);
          }}
          onRemove={(key) => {
            const next = { ...items };
            delete next[key];
            setItems(next);
          }}
        />
      </div>
    );
  },
};

