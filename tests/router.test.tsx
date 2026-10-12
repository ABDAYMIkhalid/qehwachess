import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Link, RouterProvider } from '@/context/RouterContext';

let renderer: ReactTestRenderer;
let location: { hash: string };
beforeEach(() => {
  location = { hash: '#/' };
  vi.stubGlobal('window', { location, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  act(() => { renderer = create(<RouterProvider><Link to={{ name: 'tournaments' }}>Tournaments</Link></RouterProvider>); });
});
afterEach(() => { act(() => renderer.unmount()); vi.unstubAllGlobals(); });

it('navigates on an ordinary click', () => {
  const preventDefault = vi.fn();
  act(() => renderer.root.findByType('a').props.onClick({ button: 0, preventDefault }));
  expect(preventDefault).toHaveBeenCalled();
  expect(location.hash).toBe('/tournaments');
});
it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])(
  'leaves browser navigation intact for %j', (modifier) => {
    const preventDefault = vi.fn();
    act(() => renderer.root.findByType('a').props.onClick({ button: 0, preventDefault, ...modifier }));
    expect(preventDefault).not.toHaveBeenCalled();
    expect(location.hash).toBe('#/');
  },
);
