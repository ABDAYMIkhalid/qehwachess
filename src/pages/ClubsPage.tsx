import { useState } from 'react';
import { useClubs } from '@/hooks/useData';
import { Button } from '@/components/ui/Button';
import { Link } from '@/context/RouterContext';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageLoader, EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Building2, MapPin, Mail, Phone } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export function ClubsPage() {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const { clubs, loading, error, totalCount, totalPages, hasNextPage, hasPreviousPage } =
    useClubs({ page, pageSize: 12 });

  return (
    <div className="min-h-screen pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white">{t('Chess Clubs')}</h1>
          <p className="text-gray-500 mt-2">{t('Discover chess clubs across Morocco and their events')}</p>
        </div>

        {error && (
          <div className="mb-4">
            <ErrorState message={error} />
          </div>
        )}
        {loading ? (
          <PageLoader />
        ) : clubs.length === 0 ? (
          <EmptyState icon={<Building2 className="w-12 h-12" />} title={t('No clubs yet')} description={t('Chess clubs will appear here once organizers register them.')} />
        ) : (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clubs.map((club) => (
              <Link key={club.id} to={{ name: 'club', id: club.id }}>
                <Card hover className="p-6 h-full group cursor-pointer animate-fade-in-up" >
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-700/20 border border-brand-500/30 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-7 h-7 text-brand-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-white group-hover:text-brand-300 transition-colors">{club.name}</h3>
                      {club.city && (
                        <div className="flex items-center gap-1 mt-1 text-sm text-gray-500">
                          <MapPin className="w-3.5 h-3.5" />
                          {club.city.name}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-400 leading-relaxed line-clamp-3 mb-4">{club.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {club.contact_email && (
                      <Badge className="bg-surface-800 text-gray-400 border-surface-700">
                        <Mail className="w-3 h-3" /> {t('Email')}
                      </Badge>
                    )}
                    {club.contact_phone && (
                      <Badge className="bg-surface-800 text-gray-400 border-surface-700">
                        <Phone className="w-3 h-3" /> {t('Phone')}
                      </Badge>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={!hasPreviousPage} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                {t('Previous')}
              </Button>
              <span className="text-sm text-gray-400">{t('Page')} {page} {t('of')} {totalPages}</span>
              <Button variant="outline" size="sm" disabled={!hasNextPage} onClick={() => setPage((p) => p + 1)}>
                {t('Next')}
              </Button>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}
