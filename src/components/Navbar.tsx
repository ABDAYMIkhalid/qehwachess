import { useState, useEffect } from 'react';
import { Link, useRouter } from '@/context/RouterContext';
import { useAuth } from '@/context/AuthContext';
import { Language, useLanguage } from '@/context/LanguageContext';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/context/ThemeContext';
import { Menu, X, LayoutDashboard, Shield, Settings, LogOut, ChevronDown, Crown, MessageCircle, Sun, Moon } from 'lucide-react';

export function Navbar() {
  const { route, navigate } = useRouter();
  const { user, profile, signOut } = useAuth();
  const { language, chooseLanguage, languageNames, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [route]);

  const navLinks = [
    { label: 'Tournaments', to: { name: 'tournaments' } as const },
    { label: 'Casual Meetups', to: { name: 'meetups' } as const },
    { label: 'Players', to: { name: 'players' } as const },
    { label: 'Map', to: { name: 'map' } as const },
    { label: 'Clubs', to: { name: 'clubs' } as const },
    { label: 'Cities', to: { name: 'cities' } as const },
  ];
  const languagePicker = (
    <label className="flex items-center gap-2 text-xs text-gray-400">
      <span className="sr-only">{t('Language / Langue')}</span>
      <select
        aria-label={t('Language / Langue')}
        value={language}
        onChange={(event) => chooseLanguage(event.target.value as Language)}
        className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand-500"
      >
        {(['en', 'fr', 'ar'] as Language[]).map((option) => (
          <option key={option} value={option}>{languageNames[option]}</option>
        ))}
      </select>
    </label>
  );

  const isActive = (name: string) => route.name === name;
  const dashboardLabel =
    profile?.role === 'organizer'
      ? t('Organizer Dashboard')
      : profile?.role === 'admin'
        ? t('Admin Dashboard')
        : t('Dashboard');

  function getDashboardRoute() {
    if (!profile) return { name: 'dashboard' as const };
    if (profile.role === 'admin') return { name: 'admin' as const };
    if (profile.role === 'organizer') return { name: 'organizer' as const };
    return { name: 'dashboard' as const };
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'glass border-b border-surface-700/50' : 'bg-transparent'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to={{ name: 'home' }} className="flex items-center gap-2 group">
            <div className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/20 group-hover:shadow-brand-500/40 transition-all">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-base font-bold text-white tracking-tight">Qehwa Chess</span>
              <span className="text-[10px] text-brand-400 font-medium tracking-wider uppercase">{t('Discover · Play · Compete')}</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden xl:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  isActive(link.to.name)
                    ? 'text-brand-300 bg-brand-500/10'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {t(link.label)}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="hidden xl:flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-surface-700 bg-surface-900 text-gray-300 transition-colors hover:border-brand-500/60 hover:text-white"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {languagePicker}
            {user && (
              <button
                type="button"
                onClick={() => navigate({ name: 'messages' })}
                aria-label={t('Messages')}
                title={t('Messages')}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                <MessageCircle className="h-5 w-5" />
              </button>
            )}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-all"
                >
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-sm font-bold">
                      {profile?.full_name?.charAt(0) ?? 'U'}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-300 max-w-[100px] truncate">
                    {profile?.full_name?.split(' ')[0] ?? 'User'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-surface-900 border border-surface-700 rounded-xl shadow-2xl py-2 animate-slide-down">
                    <div className="px-4 py-2 border-b border-surface-700/50">
                      <p className="text-sm font-semibold text-white truncate">{profile?.full_name}</p>
                      <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
                    </div>
                    <button
                      onClick={() => navigate(getDashboardRoute())}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-all"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      {dashboardLabel}
                    </button>
                    {profile?.role === 'organizer' && (
                      <button
                        onClick={() => navigate({ name: 'organizer' })}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-all"
                      >
                        <Settings className="w-4 h-4" />
                        {t('Organizer Panel')}
                      </button>
                    )}
                    {profile?.role === 'admin' && (
                      <button
                        onClick={() => navigate({ name: 'admin' })}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-all"
                      >
                        <Shield className="w-4 h-4" />
                        {t('Admin Panel')}
                      </button>
                    )}
                    <button
                      onClick={() => navigate({ name: 'profile' })}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-all"
                    >
                      <Settings className="w-4 h-4" />
                      {t('Profile Settings')}
                    </button>
                    <div className="border-t border-surface-700/50 mt-1 pt-1">
                      <button
                        onClick={() => signOut()}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-error-400 hover:bg-error-500/10 transition-all"
                      >
                        <LogOut className="w-4 h-4" />
                        {t('Sign Out')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link to={{ name: 'signin' }}>
                  <Button variant="ghost" size="sm">{t('Sign In')}</Button>
                </Link>
                <Link to={{ name: 'signup' }}>
                  <Button size="sm">{t('Get Started')}</Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            className="xl:hidden p-2 text-gray-300 hover:text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="xl:hidden glass border-t border-surface-700/50 py-4 animate-slide-down">
            <div className="flex flex-col gap-1 px-2">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  to={link.to}
                  className={`px-4 py-3 text-sm font-medium rounded-lg ${
                    isActive(link.to.name)
                      ? 'text-brand-300 bg-brand-500/10'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {t(link.label)}
                </Link>
              ))}
              <div className="border-t border-surface-700/50 mt-2 pt-2">
                <div className="px-4 py-2 flex items-center justify-between gap-2">
                  {languagePicker}
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-surface-700 bg-surface-900 text-gray-300 transition-colors hover:border-brand-500/60 hover:text-white"
                    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  >
                    {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </button>
                </div>
                {user ? (
                  <>
                    <button
                      onClick={() => navigate({ name: 'messages' })}
                      className="w-full text-left px-4 py-3 text-sm font-medium text-gray-300 hover:bg-white/5 rounded-lg"
                    >
                      {t('Messages')}
                    </button>
                    <button
                      onClick={() => navigate(getDashboardRoute())}
                      className="w-full text-left px-4 py-3 text-sm font-medium text-gray-300 hover:bg-white/5 rounded-lg"
                    >
                      {dashboardLabel}
                    </button>
                    <button
                      onClick={() => navigate({ name: 'profile' })}
                      className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium text-gray-300 hover:bg-white/5"
                    >
                      <Settings className="h-4 w-4" />
                      {t('Profile Settings')}
                    </button>
                    <button
                      onClick={() => signOut()}
                      className="w-full text-left px-4 py-3 text-sm font-medium text-error-400 hover:bg-error-500/10 rounded-lg"
                    >
                      {t('Sign Out')}
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-2 px-2">
                    <Link to={{ name: 'signin' }}>
                      <Button variant="secondary" size="sm" className="w-full">{t('Sign In')}</Button>
                    </Link>
                    <Link to={{ name: 'signup' }}>
                      <Button size="sm" className="w-full">{t('Get Started')}</Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
