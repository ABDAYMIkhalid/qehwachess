// .or() accepts raw PostgREST syntax. Quote the whole pattern so punctuation
// stays inside the search value rather than becoming another filter.
export function tournamentSearchFilter(search: string): string {
  const literal = search.trim().replace(/[\\%_*]/g, '\\$&');
  const pattern = `%${literal}%`.replace(/[\\"]/g, '\\$&');
  return ['title', 'description', 'venue']
    .map((column) => `${column}.ilike."${pattern}"`)
    .join(',');
}
