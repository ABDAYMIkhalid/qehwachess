import { useCityTournaments } from '@/hooks/useData';
import { Link } from '@/context/RouterContext';
import { Card } from '@/components/ui/Card';
import { TournamentCard } from '@/components/TournamentCard';
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/Feedback';
import { MapPin, ArrowLeft, Trophy, Building2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export function CityDetailPage({ id }: { id: string }) {
  const { t } = useLanguage();
  const { city, tournaments, clubs, loading } = useCityTournaments(id);

  if (loading) return <div className="pt-24"><PageLoader /></div>;
  if (!city) return <div className="pt-24"><ErrorState message={t('City not found.')} /></div>;

  return (
    <div className="min-h-screen pt-20 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link to={{ name: 'cities' }} className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-brand-300 transition-colors mb-6 mt-4">
          <ArrowLeft className="w-4 h-4" />
          {t('Back to cities')}
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-700/20 border border-brand-500/30 flex items-center justify-center">
              <MapPin className="w-6 h-6 text-brand-400" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white">{city.name}</h1>
              <p className="text-gray-500">{city.region}</p>
            </div>
          </div>
          <div className="flex gap-4 mt-4">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Trophy className="w-4 h-4 text-brand-400" />
              {tournaments.length} {tournaments.length === 1 ? t('tournament') : t('tournaments')}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Building2 className="w-4 h-4 text-brand-400" />
              {clubs.length} {clubs.length === 1 ? t('club') : t('clubs')}
            </div>
          </div>
        </div>

        {/* Tournaments */}
        {tournaments.length === 0 ? (
          <EmptyState icon={<Trophy className="w-12 h-12" />} title={t('No tournaments in this city')} description={t('Check back later or explore other cities.')} />
        ) : (
          <>
            <h2 className="text-xl font-bold text-white mb-4">{t('Tournaments in')} {city.name}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
              {tournaments.map((t) => (
                <TournamentCard key={t.id} tournament={t} />
              ))}
            </div>
          </>
        )}

        {/* Clubs */}
        {clubs.length > 0 && (
          <>
            <h2 className="text-xl font-bold text-white mb-4">{t('Chess Clubs')} {t('in')} {city.name}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {clubs.map((club) => (
                <Link key={club.id} to={{ name: 'club', id: club.id }}>
                  <Card hover className="p-5 group cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-5 h-5 text-brand-400" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-white group-hover:text-brand-300 transition-colors truncate">{club.name}</h3>
                        <p className="text-sm text-gray-500 line-clamp-1">{club.description}</p>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
