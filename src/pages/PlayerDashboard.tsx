import { useEffect, useState } from 'react';
import { Link, useRouter } from '@/context/RouterContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageLoader, EmptyState } from '@/components/ui/Feedback';
import {
  Trophy,
  Calendar,
  MapPin,
  Clock,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { Registration, Tournament } from '@/types';
import { formatDateRange, getDaysUntil } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';

export function PlayerDashboard() {
  const { t } = useLanguage();
  const { user, profile, loading: authLoading } = useAuth();
  const { navigate } = useRouter();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('registrations')
        .select('*, tournament:tournaments(*, city:cities(*), club:clubs(*))')
        .eq('player_id', user.id)
        .order('registered_at', { ascending: false });
      setRegistrations(data ?? []);
      setLoading(false);
    })();
  }, [user]);

  if (authLoading) return <div className="pt-24"><PageLoader /></div>;
  if (!user) {
    navigate({ name: 'signin' });
    return null;
  }

  const activeRegs = registrations.filter((r) => r.status !== 'cancelled');
  const upcomingRegs = activeRegs.filter(
    (r) => r.tournament && getDaysUntil(r.tournament.start_date) >= 0
  );
  const pastRegs = activeRegs.filter(
    (r) => r.tournament && getDaysUntil(r.tournament.start_date) < 0
  );

  return (
    <div className="min-h-screen pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">{t('My Dashboard')}</h1>
          <p className="text-gray-500 mt-2">{t('Welcome back')}, {profile?.full_name?.split(' ')[0]}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Trophy, label: t('Total Registrations'), value: registrations.length, color: 'text-brand-400' },
            { icon: Calendar, label: t('Upcoming'), value: upcomingRegs.length, color: 'text-success-400' },
            { icon: Clock, label: t('Past Events'), value: pastRegs.length, color: 'text-gray-400' },
            { icon: Users, label: t('Active'), value: activeRegs.length, color: 'text-accent-400' },
          ].map((stat, i) => (
            <Card key={i} className="p-5">
              <stat.icon className={`w-5 h-5 ${stat.color} mb-3`} />
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
            </Card>
          ))}
        </div>

        {/* Upcoming */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-white mb-4">{t('Upcoming Tournaments')}</h2>
          {loading ? (
            <PageLoader />
          ) : upcomingRegs.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={<Trophy className="w-12 h-12" />}
                title={t('No upcoming tournaments')}
                description={t('Browse tournaments and register to see them here.')}
                action={
                  <Link to={{ name: 'tournaments' }}>
                    <Button size="sm">{t('Browse Tournaments')}</Button>
                  </Link>
                }
              />
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {upcomingRegs.map((reg) => (
                <RegCard key={reg.id} reg={reg} />
              ))}
            </div>
          )}
        </div>

        {/* Past */}
        {pastRegs.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-white mb-4">{t('Past Tournaments')}</h2>
            <div className="flex flex-col gap-4">
              {pastRegs.map((reg) => (
                <RegCard key={reg.id} reg={reg} past />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RegCard({ reg, past = false }: { reg: Registration; past?: boolean }) {
  const { t: translate, language } = useLanguage();
  const tournament = reg.tournament as Tournament;
  if (!tournament) return null;
  const days = getDaysUntil(tournament.start_date);

  return (
    <Link to={{ name: 'tournament', id: tournament.id }}>
      <Card hover className="p-5 flex items-center gap-4 group cursor-pointer">
        <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
          <Trophy className="w-6 h-6 text-brand-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white group-hover:text-brand-300 transition-colors truncate">{tournament.title}</h3>
          <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-500">
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{tournament.city?.name}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDateRange(tournament.start_date, tournament.end_date, language)}</span>
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-1">
          <Badge className={
            reg.status === 'confirmed' ? 'bg-success-500/20 text-success-300 border-success-500/30' :
            reg.status === 'waitlisted' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
            'bg-gray-500/20 text-gray-400 border-gray-500/30'
          }>
            {reg.status === 'confirmed' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
            {translate(reg.status)}
          </Badge>
          {!past && days >= 0 && (
            <span className="text-xs text-gray-500">{days === 0 ? translate('Today') : `${translate('in')} ${days} ${translate('days')}`}</span>
          )}
        </div>
      </Card>
    </Link>
  );
}
