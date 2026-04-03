import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactElement } from 'react';

export async function renderReact(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(element);
  });

  return {
    container,
    root,
    async rerender(nextElement: ReactElement) {
      await act(async () => {
        root.render(nextElement);
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

export async function flushReact() {
  await act(async () => {
    await Promise.resolve();
  });
}
