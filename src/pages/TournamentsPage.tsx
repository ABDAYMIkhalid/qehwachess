import { useState, useMemo } from 'react';
import { useTournaments, useCities } from '@/hooks/useData';
import { TournamentCard } from '@/components/TournamentCard';
import { PageLoader, EmptyState } from '@/components/ui/Feedback';
import { Search, SlidersHorizontal, X, Trophy } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export function TournamentsPage() {
  const { t } = useLanguage();
  const { cities } = useCities();
  const [search, setSearch] = useState('');
  const [cityId, setCityId] = useState('');
  const [format, setFormat] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const filters = useMemo(
    () => ({
      search: search || undefined,
      cityId: cityId || undefined,
      format: format || undefined,
    }),
    [search, cityId, format]
  );

  const { tournaments, loading } = useTournaments(filters);

  const activeFilterCount = (cityId ? 1 : 0) + (format ? 1 : 0);

  function clearFilters() {
    setCityId('');
    setFormat('');
    setSearch('');
  }

  const formats = [
    { value: 'swiss', label: t('Swiss System') },
    { value: 'round-robin', label: t('Round Robin') },
    { value: 'knockout', label: t('Knockout') },
    { value: 'blitz', label: t('Blitz') },
    { value: 'rapid', label: t('Rapid') },
    { value: 'classical', label: t('Classical') },
  ];

  return (
    <div className="min-h-screen pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white">{t('Tournaments')}</h1>
          <p className="text-gray-500 mt-2">{t('Discover chess tournaments happening across Morocco')}</p>
        </div>

        {/* Search bar */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('Search by name, venue, or description...')}
              className="w-full pl-12 pr-4 py-3 bg-surface-900 border border-surface-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-3 rounded-xl border transition-all flex items-center gap-2 text-sm font-medium ${
              showFilters || activeFilterCount > 0
                ? 'bg-brand-500/10 border-brand-500/40 text-brand-300'
                : 'bg-surface-900 border-surface-700 text-gray-400 hover:text-white hover:border-surface-600'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">{t('Filters')}</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-brand-500 text-white text-xs font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="bg-surface-900 border border-surface-700 rounded-xl p-5 mb-6 animate-slide-down">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-400 mb-2 block">{t('City')}</label>
                <select
                  value={cityId}
                  onChange={(e) => setCityId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-surface-800 border border-surface-700 rounded-lg text-white focus:outline-none focus:border-brand-500 transition-colors"
                >
                  <option value="">{t('All cities')}</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-400 mb-2 block">{t('Format')}</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="w-full px-3 py-2.5 bg-surface-800 border border-surface-700 rounded-lg text-white focus:outline-none focus:border-brand-500 transition-colors"
                >
                  <option value="">{t('All formats')}</option>
                  {formats.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="mt-4 flex items-center gap-1.5 text-sm text-gray-400 hover:text-error-400 transition-colors"
              >
                <X className="w-4 h-4" />
                {t('Clear all filters')}
              </button>
            )}
          </div>
        )}

        {/* Results */}
        {loading ? (
          <PageLoader />
        ) : tournaments.length === 0 ? (
          <EmptyState
            icon={<Trophy className="w-12 h-12" />}
            title={t('No tournaments found')}
            description={t('Try adjusting your search or filters to find tournaments.')}
          />
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              {tournaments.length} {tournaments.length === 1 ? 'tournament' : 'tournaments'} found
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {tournaments.map((t, i) => (
                <div key={t.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 0.05}s` }}>
                  <TournamentCard tournament={t} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
