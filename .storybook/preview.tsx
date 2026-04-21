/// <reference types="vite/client" />
import type { Preview } from '@storybook/react';
import React from 'react';
import { TooltipProvider } from '../src/components/ui/tooltip';
import '../src/index.css';

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'app-dark',
      values: [
        { name: 'app-dark', value: '#111827' },
        { name: 'light', value: '#ffffff' },
      ],
    },
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <div className="dark" style={{ minHeight: '100vh', backgroundColor: '#111827', color: '#f9fafb' }}>
        <TooltipProvider>
          <Story />
        </TooltipProvider>
      </div>
    ),
  ],
};

export default preview;
