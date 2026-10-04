import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { City, Club, Tournament, TournamentWithRelations } from '@/types';

export function useCities() {
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('cities').select('*').order('name');
      setCities(data ?? []);
      setLoading(false);
    })();
  }, []);

  return { cities, loading };
}

export function useTournaments(filters?: {
  cityId?: string;
  format?: string;
  search?: string;
  featuredOnly?: boolean;
  organizerId?: string;
  status?: string;
}) {
  const [tournaments, setTournaments] = useState<TournamentWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let query = supabase
        .from('tournaments')
        .select('*, city:cities(*), club:clubs(*), organizer:profiles(*)')
        .order('start_date', { ascending: true });

      if (filters?.cityId) query = query.eq('city_id', filters.cityId);
      if (filters?.format) query = query.eq('format', filters.format);
      if (filters?.featuredOnly) query = query.eq('featured', true);
      if (filters?.organizerId) query = query.eq('organizer_id', filters.organizerId);
      if (filters?.status) query = query.eq('status', filters.status);
      else query = query.eq('status', 'published');

      if (filters?.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,venue.ilike.%${filters.search}%`);
      }

      const { data } = await query;
      setTournaments(data ?? []);
      setLoading(false);
    })();
  }, [filters?.cityId, filters?.format, filters?.search, filters?.featuredOnly, filters?.organizerId, filters?.status]);

  return { tournaments, loading };
}

export function useTournament(id: string | undefined) {
  const [tournament, setTournament] = useState<TournamentWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [registrationCount, setRegistrationCount] = useState(0);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('tournaments')
        .select('*, city:cities(*), club:clubs(*), organizer:profiles(*)')
        .eq('id', id)
        .maybeSingle();

      setTournament(data as TournamentWithRelations | null);

      if (data) {
        const { count } = await supabase
          .from('registrations')
          .select('id', { count: 'exact', head: true })
          .eq('tournament_id', id)
          .neq('status', 'cancelled');
        setRegistrationCount(count ?? 0);
      }

      setLoading(false);
    })();
  }, [id]);

  return { tournament, loading, registrationCount, setRegistrationCount };
}

export function useClubs() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('clubs')
        .select('*, city:cities(*), organizer:profiles(*)')
        .order('name');
      setClubs(data ?? []);
      setLoading(false);
    })();
  }, []);

  return { clubs, loading };
}

export function useClub(id: string | undefined) {
  const [club, setClub] = useState<Club | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('clubs')
        .select('*, city:cities(*), organizer:profiles(*)')
        .eq('id', id)
        .maybeSingle();
      setClub(data as Club | null);

      const { data: tData } = await supabase
        .from('tournaments')
        .select('*, city:cities(*)')
        .eq('club_id', id)
        .eq('status', 'published')
        .order('start_date', { ascending: true });
      setTournaments(tData ?? []);

      setLoading(false);
    })();
  }, [id]);

  return { club, tournaments, loading };
}

export function useCityTournaments(id: string | undefined) {
  const [city, setCity] = useState<City | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data: cityData } = await supabase
        .from('cities')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      setCity(cityData as City | null);

      const { data: tData } = await supabase
        .from('tournaments')
        .select('*, city:cities(*), club:clubs(*)')
        .eq('city_id', id)
        .eq('status', 'published')
        .order('start_date', { ascending: true });
      setTournaments(tData ?? []);

      const { data: cData } = await supabase
        .from('clubs')
        .select('*, city:cities(*)')
        .eq('city_id', id)
        .order('name');
      setClubs(cData ?? []);

      setLoading(false);
    })();
  }, [id]);

  return { city, tournaments, clubs, loading };
}
