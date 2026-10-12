import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { useTournaments } from '@/hooks/useData';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from } }));

type Result = { data: { id: string }[] | null; error: { message: string } | null };
function request() {
  let resolve!: (result: Result) => void;
  const promise = new Promise<Result>((done) => { resolve = done; });
  const query = {
    select: vi.fn(() => query), order: vi.fn(() => query),
    eq: vi.fn(() => query), or: vi.fn(() => query),
    abortSignal: vi.fn(() => query), then: promise.then.bind(promise),
  };
  return { query, resolve };
}
let result: ReturnType<typeof useTournaments>;
let renderer: ReactTestRenderer | undefined;
function Probe({ search }: { search: string }) {
  result = useTournaments({ search });
  return null;
}
beforeEach(() => from.mockReset());
afterEach(() => { act(() => renderer?.unmount()); renderer = undefined; });

it('keeps the latest search when older requests finish later', async () => {
  const old = request();
  const latest = request();
  from.mockReturnValueOnce(old.query).mockReturnValueOnce(latest.query);
  act(() => { renderer = create(<Probe search="Rabat" />); });
  act(() => { renderer!.update(<Probe search="Casablanca" />); });
  expect(old.query.abortSignal.mock.calls[0][0].aborted).toBe(true);
  await act(async () => latest.resolve({ data: [{ id: 'latest' }], error: null }));
  await act(async () => old.resolve({ data: [{ id: 'old' }], error: null }));
  expect(result.tournaments.map((item) => item.id)).toEqual(['latest']);
  expect(result.loading).toBe(false);
});

it('shows failures separately from an empty result and clears them on the next search', async () => {
  const failed = request();
  const retried = request();
  from.mockReturnValueOnce(failed.query).mockReturnValueOnce(retried.query);
  act(() => { renderer = create(<Probe search="Rabat" />); });
  await act(async () => failed.resolve({ data: null, error: { message: 'Network request failed' } }));
  expect(result.error).toBeTruthy();
  expect(result.loading).toBe(false);
  act(() => { renderer!.update(<Probe search="Casablanca" />); });
  expect(result.loading).toBe(true);
  expect(result.error).toBeNull();
  await act(async () => retried.resolve({ data: [], error: null }));
  expect(result.error).toBeNull();
  expect(result.tournaments).toEqual([]);
});
