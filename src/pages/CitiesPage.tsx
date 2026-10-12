import { useCities, useTournaments } from '@/hooks/useData';
import { Link } from '@/context/RouterContext';
import { Card } from '@/components/ui/Card';
import { PageLoader, EmptyState } from '@/components/ui/Feedback';
import { MapPin, Trophy, ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { useLanguage } from '@/context/LanguageContext';

export function CitiesPage() {
  const { t } = useLanguage();
  const { cities, loading } = useCities();
  const { tournaments } = useTournaments();

  const cityTournamentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tournaments) {
      if (t.city_id) counts[t.city_id] = (counts[t.city_id] ?? 0) + 1;
    }
    return counts;
  }, [tournaments]);

  const citiesWithTournaments = useMemo(
    () => cities.sort((a, b) => (cityTournamentCounts[b.id] ?? 0) - (cityTournamentCounts[a.id] ?? 0)),
    [cities, cityTournamentCounts]
  );

  return (
    <div className="min-h-screen pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white">{t('Cities')}</h1>
          <p className="text-gray-500 mt-2">{t('Explore chess tournaments by city across Morocco')}</p>
        </div>

        {loading ? (
          <PageLoader />
        ) : cities.length === 0 ? (
          <EmptyState icon={<MapPin className="w-12 h-12" />} title={t('No cities available')} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {citiesWithTournaments.map((city) => {
              const count = cityTournamentCounts[city.id] ?? 0;
              return (
                <Link key={city.id} to={{ name: 'city', id: city.id }}>
                  <Card hover className="p-6 group cursor-pointer animate-fade-in-up" >
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-700/20 border border-brand-500/30 flex items-center justify-center">
                        <MapPin className="w-6 h-6 text-brand-400" />
                      </div>
                      {count > 0 && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-300 text-xs font-semibold">
                          <Trophy className="w-3 h-3" />
                          {count} {count === 1 ? t('event') : t('events')}
                        </div>
                      )}
                    </div>
                    <h3 className="font-bold text-white text-lg group-hover:text-brand-300 transition-colors">{city.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{city.region}</p>
                    <div className="flex items-center gap-1 mt-4 text-sm text-brand-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      {t('Explore tournaments')}
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
