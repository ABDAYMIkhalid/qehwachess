import { useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { RouterProvider, useRouter } from '@/context/RouterContext';
import { Language, LanguageProvider, useLanguage } from '@/context/LanguageContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Spinner } from '@/components/ui/Feedback';
import { HomePage } from '@/pages/HomePage';
import { TournamentsPage } from '@/pages/TournamentsPage';
import { MeetupsPage } from '@/pages/MeetupsPage';
import { PlayersPage } from '@/pages/PlayersPage';
import { EventMapPage } from '@/pages/EventMapPage';
import { ClubManagementPage } from '@/pages/ClubManagementPage';
import { MessagesPage } from '@/pages/MessagesPage';
import { TournamentDetailPage } from '@/pages/TournamentDetailPage';
import { ClubsPage } from '@/pages/ClubsPage';
import { ClubDetailPage } from '@/pages/ClubDetailPage';
import { CitiesPage } from '@/pages/CitiesPage';
import { CityDetailPage } from '@/pages/CityDetailPage';
import { SignInPage } from '@/pages/SignInPage';
import { SignUpPage } from '@/pages/SignUpPage';
import { PlayerDashboard } from '@/pages/PlayerDashboard';
import { OrganizerDashboard } from '@/pages/OrganizerDashboard';
import { AdminDashboard } from '@/pages/AdminDashboard';
import { ProfilePage } from '@/pages/ProfilePage';

function AppRoutes() {
  const { route } = useRouter();
  const { profile } = useAuth();

  const renderPage = () => {
    switch (route.name) {
      case 'home': return <HomePage />;
      case 'tournaments': return <TournamentsPage />;
      case 'tournament': return <TournamentDetailPage id={route.id} />;
      case 'meetups': return <MeetupsPage />;
      case 'players': return <PlayersPage />;
      case 'map': return <EventMapPage />;
      case 'clubManagement': return <ClubManagementPage />;
      case 'messages': return <MessagesPage playerId={route.playerId} meetupId={route.meetupId} />;
      case 'clubs': return <ClubsPage />;
      case 'club': return <ClubDetailPage id={route.id} />;
      case 'cities': return <CitiesPage />;
      case 'city': return <CityDetailPage id={route.id} />;
      case 'signin': return <SignInPage />;
      case 'signup': return <SignUpPage />;
      case 'dashboard':
        if (profile?.role === 'organizer') return <OrganizerDashboard />;
        if (profile?.role === 'admin') return <AdminDashboard />;
        return <PlayerDashboard />;
      case 'organizer': return <OrganizerDashboard />;
      case 'admin': return <AdminDashboard />;
      case 'profile': return <ProfilePage />;
      default: return <HomePage />;
    }
  };

  const isAuthPage = route.name === 'signin' || route.name === 'signup';

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      <Navbar />
      <main className="flex-1">
        {renderPage()}
      </main>
      {!isAuthPage && <Footer />}
    </div>
  );
}

function AppShell() {
  const { loading } = useAuth();
  const { language, hasChosenLanguage, chooseLanguage, languageNames, t } = useLanguage();
  const [pendingLanguage, setPendingLanguage] = useState<Language>(language);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <AppRoutes />
      {!hasChosenLanguage && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-surface-950/90 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-surface-700 bg-surface-900 p-8 shadow-2xl">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white">Qehwa Chess</h1>
              <h2 className="mt-3 text-xl font-semibold text-white">{t('Choose your language')}</h2>
              <p className="mt-2 text-sm text-gray-400">{t('You can change this anytime from the menu.')}</p>
            </div>
            <div className="mt-6 grid gap-3">
              {(['en', 'fr', 'ar'] as Language[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPendingLanguage(option)}
                  className={`rounded-xl border px-4 py-3 text-lg font-medium transition-colors ${
                    pendingLanguage === option
                      ? 'border-brand-400 bg-brand-500/10 text-white'
                      : 'border-surface-700 bg-surface-800 text-gray-300 hover:border-surface-500'
                  }`}
                >
                  {languageNames[option]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => chooseLanguage(pendingLanguage)}
              className="mt-6 w-full rounded-xl bg-brand-500 px-4 py-3 font-semibold text-white transition-colors hover:bg-brand-400"
            >
              {pendingLanguage === 'en' ? 'Continue' : pendingLanguage === 'fr' ? 'Continuer' : 'متابعة'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <RouterProvider>
            <AppShell />
            <Analytics />
          </RouterProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
