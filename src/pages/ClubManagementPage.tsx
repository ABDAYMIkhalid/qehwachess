import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, Building2, Check, Clock3, ImagePlus, MapPin, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/context/RouterContext';
import { useCities } from '@/hooks/useData';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import type { Club, ClubMembership } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';

type ManagedMembership = ClubMembership & {
  profile: NonNullable<ClubMembership['profile']>;
};

interface ManagedTeamMember {
  id: string;
  team_id: string;
  profile_id: string;
  profile: { id: string; full_name: string; username: string | null } | null;
}

interface ManagedTeam {
  id: string;
  club_id: string;
  name: string;
  members: ManagedTeamMember[];
}

export function ClubManagementPage() {
  const { t } = useLanguage();
  const { user, profile, loading: authLoading } = useAuth();
  const { navigate } = useRouter();
  const { cities } = useCities();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClubId, setSelectedClubId] = useState('');
  const [memberships, setMemberships] = useState<ManagedMembership[]>([]);
  const [teams, setTeams] = useState<ManagedTeam[]>([]);
  const [teamName, setTeamName] = useState('');
  const [teamMemberIds, setTeamMemberIds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teamSaving, setTeamSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingClubId, setEditingClubId] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', city_id: '', description: '', address: '', contact_email: '', contact_phone: '' });

  useEffect(() => {
    if (!user || authLoading) return;
    let active = true;
    async function loadClubs() {
      const query = supabase
        .from('clubs')
        .select('*, city:cities(*)')
        .order('name');
      if (profile?.role !== 'admin') query.eq('organizer_id', user!.id);
      const { data, error: queryError } = await query;
      if (!active) return;
      if (queryError) setError(queryError.message);
      const ownClubs = (data ?? []) as Club[];
      setClubs(ownClubs);
      setSelectedClubId((current) => ownClubs.some((club) => club.id === current) ? current : ownClubs[0]?.id ?? '');
      setLoading(false);
    }
    void loadClubs();
    return () => { active = false; };
  }, [authLoading, profile?.role, user]);

  useEffect(() => {
    if (!selectedClubId) {
      setMemberships([]);
      return;
    }
    let active = true;
    async function loadMemberships() {
      const { data, error: queryError } = await supabase
        .from('club_memberships')
        .select('*, profile:profiles!club_memberships_profile_id_fkey(id, full_name, email, avatar_url, username)')
        .eq('club_id', selectedClubId)
        .order('joined_at', { ascending: false });
      if (!active) return;
      if (queryError) setError(queryError.message);
      setMemberships((data ?? []) as unknown as ManagedMembership[]);
    }
    void loadMemberships();
    return () => { active = false; };
  }, [selectedClubId]);

  useEffect(() => {
    if (!selectedClubId) {
      setTeams([]);
      return;
    }
    let active = true;
    async function loadTeams() {
      const { data: teamData, error: teamError } = await supabase
        .from('club_teams')
        .select('id, club_id, name')
        .eq('club_id', selectedClubId)
        .order('name');
      if (!active) return;
      if (teamError) {
        setError(teamError.message);
        setTeams([]);
        return;
      }
      const teamIds = (teamData ?? []).map((team) => team.id);
      let teamMemberships: ManagedTeamMember[] = [];
      if (teamIds.length > 0) {
        const { data: membershipData, error: teamMembershipError } = await supabase
          .from('club_team_memberships')
          .select('id, team_id, profile_id, profile:profiles!club_team_memberships_profile_id_fkey(id, full_name, username)')
          .in('team_id', teamIds);
        if (!active) return;
        if (teamMembershipError) setError(teamMembershipError.message);
        teamMemberships = (membershipData ?? []) as unknown as ManagedTeamMember[];
      }
      setTeams((teamData ?? []).map((team) => ({
        id: team.id,
        club_id: team.club_id,
        name: team.name,
        members: teamMemberships.filter((membership) => membership.team_id === team.id),
      })));
    }
    void loadTeams();
    return () => { active = false; };
  }, [selectedClubId]);

  if (authLoading) return <div className="pt-24"><PageLoader /></div>;
  if (!user) {
    navigate({ name: 'signin' });
    return null;
  }
  if (profile?.role !== 'organizer' && profile?.role !== 'admin') {
    return <div className="pt-24"><ErrorState message={t('Organizer access required to manage clubs.')} /></div>;
  }

  function resetClubForm() {
    setForm({ name: '', city_id: '', description: '', address: '', contact_email: '', contact_phone: '' });
    setLogoFile(null);
    setEditingClubId(null);
  }

  function editClub(club: Club) {
    setForm({
      name: club.name,
      city_id: club.city_id ?? '',
      description: club.description,
      address: club.address ?? '',
      contact_email: club.contact_email ?? '',
      contact_phone: club.contact_phone ?? '',
    });
    setLogoFile(null);
    setEditingClubId(club.id);
    setError(null);
    setShowForm(true);
  }

  async function uploadClubLogo(clubId: string, file: File) {
    if (!user) return { logoUrl: null, error: t('You must be signed in to upload a club logo.') };
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    const extension = extensions[file.type];
    if (!extension || file.size > 5 * 1024 * 1024) {
      return { logoUrl: null, error: t('Choose a JPEG, PNG, WebP, or GIF image no larger than 5 MB.') };
    }

    const path = `${user.id}/${clubId}/logo.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('club-logos')
      .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: true });
    if (uploadError) return { logoUrl: null, error: uploadError.message };

    const { data } = supabase.storage.from('club-logos').getPublicUrl(path);
    const logoUrl = `${data.publicUrl}?v=${Date.now()}`;
    const { error: updateError } = await supabase
      .from('clubs')
      .update({ logo_url: logoUrl })
      .eq('id', clubId);
    if (updateError) return { logoUrl: null, error: updateError.message };
    return { logoUrl, error: null };
  }

  async function saveClub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !form.city_id) return;
    setSaving(true);
    setError(null);
    const clubFields = {
      name: form.name.trim(),
      city_id: form.city_id,
      description: form.description.trim(),
      address: form.address.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
    };
    const result = editingClubId
      ? await supabase
          .from('clubs')
          .update(clubFields)
          .eq('id', editingClubId)
          .select('*, city:cities(*)')
          .single()
      : await supabase
          .from('clubs')
          .insert({ ...clubFields, organizer_id: user.id })
          .select('*, city:cities(*)')
          .single();

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    let savedClub = result.data as Club;
    setClubs((current) => {
      const exists = current.some((club) => club.id === savedClub.id);
      const updated = exists
        ? current.map((club) => club.id === savedClub.id ? savedClub : club)
        : [...current, savedClub];
      return updated.sort((a, b) => a.name.localeCompare(b.name));
    });
    setSelectedClubId(savedClub.id);
    setEditingClubId(savedClub.id);

    if (logoFile) {
      const { logoUrl, error: logoError } = await uploadClubLogo(savedClub.id, logoFile);
      if (logoError) {
        setError(`${t('Club details saved, but the logo could not be uploaded:')} ${logoError}`);
        setShowForm(true);
        setSaving(false);
        return;
      }
      savedClub = { ...savedClub, logo_url: logoUrl };
      setClubs((current) => current.map((club) => club.id === savedClub.id ? savedClub : club));
    }

    setShowForm(false);
    resetClubForm();
    setSaving(false);
  }

  async function reviewMembership(membership: ManagedMembership, status: 'active' | 'rejected') {
    setError(null);
    const { error: updateError } = await supabase
      .from('club_memberships')
      .update({ status })
      .eq('id', membership.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMemberships((current) => current.map((item) => item.id === membership.id ? { ...item, status } : item));
  }

  async function removeMembership(membership: ManagedMembership) {
    if (!confirm(t('Remove this member from the club?'))) return;
    setError(null);
    const { error: deleteError } = await supabase.from('club_memberships').delete().eq('id', membership.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setMemberships((current) => current.filter((item) => item.id !== membership.id));
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedClubId || !teamName.trim()) return;
    setTeamSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('club_teams')
      .insert({ club_id: selectedClubId, name: teamName.trim() })
      .select('id, club_id, name')
      .single();
    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setTeams((current) => [...current, { ...data, members: [] }].sort((a, b) => a.name.localeCompare(b.name)));
      setTeamName('');
    }
    setTeamSaving(false);
  }

  async function addTeamMember(team: ManagedTeam) {
    const profileId = teamMemberIds[team.id];
    if (!profileId) return;
    setError(null);
    const { data, error: insertError } = await supabase
      .from('club_team_memberships')
      .insert({ team_id: team.id, profile_id: profileId })
      .select('id, team_id, profile_id, profile:profiles!club_team_memberships_profile_id_fkey(id, full_name, username)')
      .single();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    const newMember = data as unknown as ManagedTeamMember;
    setTeams((current) => current.map((item) => item.id === team.id ? { ...item, members: [...item.members, newMember] } : item));
    setTeamMemberIds((current) => ({ ...current, [team.id]: '' }));
  }

  async function removeTeamMember(team: ManagedTeam, member: ManagedTeamMember) {
    setError(null);
    const { error: deleteError } = await supabase.from('club_team_memberships').delete().eq('id', member.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setTeams((current) => current.map((item) => item.id === team.id ? { ...item, members: item.members.filter((entry) => entry.id !== member.id) } : item));
  }

  async function deleteTeam(team: ManagedTeam) {
    if (!confirm(t('Delete this team?'))) return;
    setError(null);
    const { error: deleteError } = await supabase.from('club_teams').delete().eq('id', team.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setTeams((current) => current.filter((item) => item.id !== team.id));
  }

  const selectedClub = clubs.find((club) => club.id === selectedClubId);
  const pendingCount = memberships.filter((membership) => membership.status === 'pending').length;
  const activeCount = memberships.filter((membership) => membership.status === 'active').length;

  return (
    <div className="min-h-screen pt-24 pb-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">{t('Club Management')}</h1>
            <p className="mt-2 text-gray-500">{t('Create a club, review membership requests, and manage your roster.')}</p>
          </div>
          <Button onClick={() => {
            if (showForm) {
              setShowForm(false);
              resetClubForm();
            } else {
              resetClubForm();
              setShowForm(true);
            }
          }}><Plus className="h-4 w-4" />{showForm ? t('Close') : t('Create Club')}</Button>
        </div>

        {error && <div role="alert" className="mb-5 flex items-start gap-2 rounded-lg border border-error-500/20 bg-error-500/10 p-3 text-sm text-error-400"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

        {showForm && (
          <Card className="mb-7 p-5 sm:p-7">
            <h2 className="mb-5 text-xl font-bold text-white">{t(editingClubId ? 'Edit club details' : 'Create a chess club')}</h2>
            <form onSubmit={saveClub} className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-gray-400">{t('Club name')} *
                <input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 w-full rounded-lg border border-surface-700 bg-surface-800 px-3.5 py-2.5 text-white" />
              </label>
              <label className="text-sm text-gray-400">{t('City')} *
                <select required value={form.city_id} onChange={(event) => setForm({ ...form, city_id: event.target.value })} className="mt-1.5 w-full rounded-lg border border-surface-700 bg-surface-800 px-3.5 py-2.5 text-white">
                  <option value="">{t('Select city')}</option>
                  {cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
                </select>
              </label>
              <label className="text-sm text-gray-400 sm:col-span-2">{t('Description')}
                <textarea rows={3} maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1.5 w-full rounded-lg border border-surface-700 bg-surface-800 px-3.5 py-2.5 text-white" />
              </label>
              <label className="text-sm text-gray-400">{t('Address')}
                <input maxLength={200} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="mt-1.5 w-full rounded-lg border border-surface-700 bg-surface-800 px-3.5 py-2.5 text-white" />
              </label>
              <label className="text-sm text-gray-400">{t('Contact Email')}
                <input type="email" value={form.contact_email} onChange={(event) => setForm({ ...form, contact_email: event.target.value })} className="mt-1.5 w-full rounded-lg border border-surface-700 bg-surface-800 px-3.5 py-2.5 text-white" />
              </label>
              <label className="text-sm text-gray-400">{t('Contact Phone')}
                <input value={form.contact_phone} onChange={(event) => setForm({ ...form, contact_phone: event.target.value })} className="mt-1.5 w-full rounded-lg border border-surface-700 bg-surface-800 px-3.5 py-2.5 text-white" />
              </label>
              <label className="text-sm text-gray-400 sm:col-span-2">{t('Club logo')}
                <span className="mt-1.5 flex items-center gap-3 rounded-lg border border-surface-700 bg-surface-800 px-3.5 py-2.5">
                  <ImagePlus className="h-5 w-5 shrink-0 text-brand-400" />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (file && (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
                        setError(t('Choose a JPEG, PNG, WebP, or GIF image no larger than 5 MB.'));
                        event.target.value = '';
                        setLogoFile(null);
                        return;
                      }
                      setError(null);
                      setLogoFile(file);
                    }}
                    className="min-w-0 w-full text-sm text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-brand-500 file:px-3 file:py-1.5 file:font-semibold file:text-white"
                  />
                </span>
                <span className="mt-1 block text-xs text-gray-500">{t('Optional. JPEG, PNG, WebP, or GIF up to 5 MB.')}</span>
              </label>
              <div className="flex justify-end gap-2 sm:col-span-2">
                {editingClubId && <Button type="button" variant="ghost" onClick={() => { setShowForm(false); resetClubForm(); }}>{t('Cancel')}</Button>}
                <Button type="submit" disabled={saving || cities.length === 0}>{saving ? t('Saving...') : t(editingClubId ? 'Save club details' : 'Create Club')}</Button>
              </div>
            </form>
          </Card>
        )}

        {loading ? <PageLoader /> : clubs.length === 0 ? (
          <Card className="p-6"><EmptyState icon={<Building2 className="h-12 w-12" />} title={t('No clubs managed yet')} description={t('Create your club to start building a local chess community.')} /></Card>
        ) : (
          <>
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-400"><Building2 className="h-4 w-4" />
                <select value={selectedClubId} onChange={(event) => setSelectedClubId(event.target.value)} className="rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-white">
                  {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                </select>
              </label>
              <div className="flex gap-4 text-sm text-gray-400"><span>{pendingCount} {t('Pending requests')}</span><span>{activeCount} {t('Active members')}</span></div>
            </div>

            {selectedClub && (
              <Card className="mb-5 flex flex-wrap items-center gap-3 p-4">
                {selectedClub.logo_url
                  ? <img src={selectedClub.logo_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  : <Building2 className="h-5 w-5 text-brand-400" />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{selectedClub.name}</p>
                  <p className="flex items-center gap-1 text-sm text-gray-500"><MapPin className="h-3.5 w-3.5" />{selectedClub.city?.name}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => editClub(selectedClub)}><Pencil className="h-4 w-4" />{t('Edit club details')}</Button>
              </Card>
            )}

            <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-white"><Users className="h-5 w-5 text-brand-400" />{t('Members and requests')}</h2>
            {memberships.length === 0 ? <Card className="p-5"><EmptyState icon={<Users className="h-10 w-10" />} title={t('No members yet')} description={t('Membership requests will appear here.')} /></Card> : (
              <div className="space-y-3">
                {memberships.map((membership) => (
                  <Card key={membership.id} className="flex flex-wrap items-center gap-3 p-4">
                    {membership.profile?.avatar_url ? <img src={membership.profile.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500/20 font-bold text-brand-200">{membership.profile?.full_name?.charAt(0) ?? 'U'}</div>}
                    <div className="min-w-0 flex-1"><p className="truncate font-semibold text-white">{membership.profile?.full_name}</p><p className="truncate text-sm text-gray-500">{membership.profile?.username ? `@${membership.profile.username}` : membership.profile?.email}</p></div>
                    <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${membership.status === 'active' ? 'bg-success-500/10 text-success-300' : membership.status === 'pending' ? 'bg-amber-500/10 text-amber-300' : 'bg-gray-500/10 text-gray-400'}`}>{membership.status === 'pending' && <Clock3 className="h-3 w-3" />}{t(membership.status)}</span>
                    {membership.status === 'pending' && <><Button size="sm" onClick={() => void reviewMembership(membership, 'active')}><Check className="h-4 w-4" />{t('Approve')}</Button><Button size="sm" variant="ghost" onClick={() => void reviewMembership(membership, 'rejected')}><X className="h-4 w-4" />{t('Reject')}</Button></>}
                    {membership.status !== 'pending' && <Button size="sm" variant="danger" onClick={() => void removeMembership(membership)}><Trash2 className="h-4 w-4" />{t('Remove')}</Button>}
                  </Card>
                ))}
              </div>
            )}

            <section className="mt-10">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div><h2 className="text-xl font-bold text-white">{t('Club Teams')}</h2><p className="mt-1 text-sm text-gray-500">{t('Create teams and assign active club members to their rosters.')}</p></div>
                <form onSubmit={(event) => void createTeam(event)} className="flex gap-2">
                  <input required maxLength={100} value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder={t('Team name')} aria-label={t('Team name')} className="min-w-0 rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-white" />
                  <Button type="submit" size="sm" disabled={teamSaving}>{teamSaving ? t('Creating...') : t('Create team')}</Button>
                </form>
              </div>
              {teams.length === 0 ? <Card className="p-5 text-sm text-gray-500">{t('No teams created for this club yet.')}</Card> : (
                <div className="grid gap-4 md:grid-cols-2">
                  {teams.map((team) => {
                    const availableMembers = memberships.filter((membership) => membership.status === 'active' && !team.members.some((member) => member.profile_id === membership.profile_id));
                    return (
                      <Card key={team.id} className="p-5">
                        <div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-semibold text-white">{team.name}</h3><Button size="sm" variant="ghost" onClick={() => void deleteTeam(team)}><Trash2 className="h-4 w-4" />{t('Delete team')}</Button></div>
                        {team.members.length === 0 ? <p className="mb-4 text-sm text-gray-500">{t('No players assigned yet.')}</p> : (
                          <ul className="mb-4 space-y-2">
                            {team.members.map((member) => <li key={member.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-800/70 px-3 py-2 text-sm"><span className="truncate text-gray-200">{member.profile?.full_name ?? t('Club member')}</span><Button size="sm" variant="ghost" onClick={() => void removeTeamMember(team, member)}>{t('Remove')}</Button></li>)}
                          </ul>
                        )}
                        <div className="flex gap-2">
                          <select aria-label={t('Choose active member')} value={teamMemberIds[team.id] ?? ''} onChange={(event) => setTeamMemberIds((current) => ({ ...current, [team.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-white">
                            <option value="">{t('Choose active member')}</option>
                            {availableMembers.map((membership) => <option key={membership.profile_id} value={membership.profile_id}>{membership.profile.full_name}</option>)}
                          </select>
                          <Button size="sm" disabled={!teamMemberIds[team.id]} onClick={() => void addTeamMember(team)}>{t('Add')}</Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
