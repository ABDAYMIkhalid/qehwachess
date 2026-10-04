/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Route =
  | { name: 'home' }
  | { name: 'tournaments' }
  | { name: 'tournament'; id: string }
  | { name: 'meetups' }
  | { name: 'players' }
  | { name: 'map' }
  | { name: 'clubManagement' }
  | { name: 'messages'; playerId?: string; meetupId?: string }
  | { name: 'clubs' }
  | { name: 'cities' }
  | { name: 'city'; id: string }
  | { name: 'club'; id: string }
  | { name: 'signin' }
  | { name: 'signup' }
  | { name: 'dashboard' }
  | { name: 'organizer' }
  | { name: 'admin' }
  | { name: 'profile' };

interface RouterContextValue {
  route: Route;
  navigate: (route: Route) => void;
}

const RouterContext = createContext<RouterContextValue | undefined>(undefined);

function parseHash(): Route {
  const hash = window.location.hash.slice(1) || '/';
  const parts = hash.split('/').filter(Boolean);

  if (parts.length === 0) return { name: 'home' };
  if (parts[0] === 'tournaments' && parts.length === 1) return { name: 'tournaments' };
  if (parts[0] === 'tournaments' && parts[1]) return { name: 'tournament', id: parts[1] };
  if (parts[0] === 'meetups') return { name: 'meetups' };
  if (parts[0] === 'players') return { name: 'players' };
  if (parts[0] === 'map') return { name: 'map' };
  if (parts[0] === 'club-management') return { name: 'clubManagement' };
  if (parts[0] === 'messages' && parts[1] === 'player' && parts[2]) return { name: 'messages', playerId: parts[2] };
  if (parts[0] === 'messages' && parts[1] === 'meetup' && parts[2]) return { name: 'messages', meetupId: parts[2] };
  if (parts[0] === 'messages') return { name: 'messages' };
  if (parts[0] === 'clubs' && parts.length === 1) return { name: 'clubs' };
  if (parts[0] === 'clubs' && parts[1]) return { name: 'club', id: parts[1] };
  if (parts[0] === 'cities' && parts.length === 1) return { name: 'cities' };
  if (parts[0] === 'cities' && parts[1]) return { name: 'city', id: parts[1] };
  if (parts[0] === 'signin') return { name: 'signin' };
  if (parts[0] === 'signup') return { name: 'signup' };
  if (parts[0] === 'dashboard') return { name: 'dashboard' };
  if (parts[0] === 'organizer') return { name: 'organizer' };
  if (parts[0] === 'admin') return { name: 'admin' };
  if (parts[0] === 'profile') return { name: 'profile' };
  return { name: 'home' };
}

function routeToHash(route: Route): string {
  switch (route.name) {
    case 'home': return '/';
    case 'tournaments': return '/tournaments';
    case 'tournament': return `/tournaments/${route.id}`;
    case 'meetups': return '/meetups';
    case 'players': return '/players';
    case 'map': return '/map';
    case 'clubManagement': return '/club-management';
    case 'messages':
      if (route.playerId) return `/messages/player/${route.playerId}`;
      if (route.meetupId) return `/messages/meetup/${route.meetupId}`;
      return '/messages';
    case 'clubs': return '/clubs';
    case 'club': return `/clubs/${route.id}`;
    case 'cities': return '/cities';
    case 'city': return `/cities/${route.id}`;
    case 'signin': return '/signin';
    case 'signup': return '/signup';
    case 'dashboard': return '/dashboard';
    case 'organizer': return '/organizer';
    case 'admin': return '/admin';
    case 'profile': return '/profile';
  }
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(parseHash());

  useEffect(() => {
    const handler = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  function navigate(newRoute: Route) {
    window.location.hash = routeToHash(newRoute);
  }

  return (
    <RouterContext.Provider value={{ route, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used within RouterProvider');
  return ctx;
}

export function Link({
  to,
  children,
  className,
  onClick,
}: {
  to: Route;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const { navigate } = useRouter();
  return (
    <a
      href={`#${routeToHash(to)}`}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
        onClick?.();
      }}
    >
      {children}
    </a>
  );
}
