import { useState, useEffect } from 'react';
import { useRouter } from '@/context/RouterContext';
import { useAuth } from '@/context/AuthContext';
import { useCities } from '@/hooks/useData';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PageLoader } from '@/components/ui/Feedback';
import { User, Mail, Phone, MapPin, Save, AlertCircle, CheckCircle2, ImageUp } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export function ProfilePage() {
  const { t } = useLanguage();
  const { user, profile, refreshProfile } = useAuth();
  const { navigate } = useRouter();
  const { cities } = useCities();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [cityId, setCityId] = useState(profile?.city_id ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [lichessUsername, setLichessUsername] = useState(profile?.lichess_username ?? '');
  const [chesscomUsername, setChesscomUsername] = useState(profile?.chesscom_username ?? '');
  const [fideId, setFideId] = useState(profile?.fide_id ?? '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setPhone(profile.phone ?? '');
      setBio(profile.bio ?? '');
      setCityId(profile.city_id ?? '');
      setUsername(profile.username ?? '');
      setLichessUsername(profile.lichess_username ?? '');
      setChesscomUsername(profile.chesscom_username ?? '');
      setFideId(profile.fide_id ?? '');
    }
  }, [profile]);

  if (!user) {
    navigate({ name: 'signin' });
    return null;
  }

  if (!profile) return <div className="pt-24"><PageLoader /></div>;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        phone: phone || null,
        bio: bio || null,
        city_id: cityId || null,
        username: username.trim().replace(/^@/, '') || null,
        lichess_username: lichessUsername.trim().replace(/^@/, '') || null,
        chesscom_username: chesscomUsername.trim().replace(/^@/, '') || null,
        fide_id: fideId.trim() || null,
      })
      .eq('id', user!.id);

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      await refreshProfile();
      setTimeout(() => setSuccess(false), 3000);
    }
    setSaving(false);
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    if (!extensions[file.type] || file.size > 5 * 1024 * 1024) {
      setError(t('Choose a JPEG, PNG, WebP, or GIF image no larger than 5 MB.'));
      return;
    }

    setUploadingAvatar(true);
    setError(null);
    setSuccess(false);
    const path = `${user!.id}/avatar.${extensions[file.type]}`;
    const { error: uploadError } = await supabase.storage
      .from('profile-avatars')
      .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: true });

    if (uploadError) {
      setError(uploadError.message);
      setUploadingAvatar(false);
      return;
    }

    const { data } = supabase.storage.from('profile-avatars').getPublicUrl(path);
    const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', user!.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      await refreshProfile();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
    setUploadingAvatar(false);
  }

  const inputClass = 'w-full px-3.5 py-2.5 bg-surface-800 border border-surface-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors text-sm';
  const labelClass = 'text-sm font-medium text-gray-400 mb-1.5 block';

  return (
    <div className="min-h-screen pt-24 pb-20">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">{t('Profile Settings')}</h1>
          <p className="text-gray-500 mt-2">{t('Update your personal information')}</p>
        </div>

        <Card className="p-6 sm:p-8">
          {/* Avatar + role */}
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-surface-700">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.full_name} className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-2xl font-bold">
                {profile.full_name?.charAt(0) ?? 'U'}
              </div>
            )}
            <div>
              <p className="text-lg font-bold text-white">{profile.full_name}</p>
              <p className="text-sm text-gray-500">{profile.email}</p>
              <Badge className="mt-1.5 bg-brand-500/20 text-brand-300 border-brand-500/30">{t(profile.role)}</Badge>
            </div>
          </div>

          <div className="mb-6">
            <label className={labelClass}>{t('Profile photo')}</label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-surface-700 bg-surface-800 px-3.5 py-2.5 text-sm text-gray-200 transition-colors hover:border-brand-500">
                <ImageUp className="h-4 w-4" />
                {uploadingAvatar ? t('Uploading...') : t('Choose photo')}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleAvatarUpload}
                  disabled={uploadingAvatar}
                  className="sr-only"
                />
              </label>
              <span className="text-xs text-gray-500">{t('Choose a JPEG, PNG, WebP, or GIF image no larger than 5 MB.')}</span>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-error-500/10 border border-error-500/20 text-error-400 text-sm mb-4">
              <AlertCircle className="w-4 h-4" />{t(error)}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-success-500/10 border border-success-500/20 text-success-400 text-sm mb-4">
              <CheckCircle2 className="w-4 h-4" />{t('Profile updated successfully!')}
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className={labelClass}>{t('Full Name')}</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={`${inputClass} pl-11`} />
              </div>
            </div>

            <div>
              <label className={labelClass}>{t('Email (read-only)')}</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input value={profile.email} disabled className={`${inputClass} pl-11 opacity-60`} />
              </div>
            </div>

            <div>
              <label className={labelClass}>{t('Phone')}</label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className={`${inputClass} pl-11`} placeholder="+212 ..." />
              </div>
            </div>

            <div>
              <label className={labelClass}>{t('City')}</label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <select value={cityId} onChange={(e) => setCityId(e.target.value)} className={`${inputClass} pl-11`}>
                  <option value="">{t('Select city')}</option>
                  {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>{t('Bio')}</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className={inputClass} placeholder={t('Tell the community about yourself...')} />
            </div>

            <div className="border-t border-surface-700 pt-5">
              <h2 className="mb-1 text-lg font-semibold text-white">{t('Chess accounts')}</h2>
              <p className="mb-4 text-xs text-gray-500">{t('These usernames are profile links only; ratings are not verified or synchronized.')}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>{t('Player username')}</label>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={24} className={inputClass} placeholder="e.g. chess_fan" />
                  <p className="mt-1 text-xs text-gray-500">{t('3–24 letters, numbers, or underscores')}</p>
                </div>
                <div>
                  <label className={labelClass}>Lichess</label>
                  <input value={lichessUsername} onChange={(e) => setLichessUsername(e.target.value)} maxLength={50} className={inputClass} placeholder="e.g. magnus" />
                </div>
                <div>
                  <label className={labelClass}>Chess.com</label>
                  <input value={chesscomUsername} onChange={(e) => setChesscomUsername(e.target.value)} maxLength={50} className={inputClass} placeholder="e.g. hikaru" />
                </div>
                <div>
                  <label className={labelClass}>{t('FIDE ID')}</label>
                  <input value={fideId} onChange={(e) => setFideId(e.target.value)} maxLength={20} className={inputClass} placeholder="e.g. 1503014" />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                {lichessUsername.trim() && (
                  <a href={`https://lichess.org/@/${encodeURIComponent(lichessUsername.trim().replace(/^@/, ''))}`} target="_blank" rel="noreferrer" className="text-brand-300 hover:underline">Lichess ↗</a>
                )}
                {chesscomUsername.trim() && (
                  <a href={`https://www.chess.com/member/${encodeURIComponent(chesscomUsername.trim().replace(/^@/, ''))}`} target="_blank" rel="noreferrer" className="text-brand-300 hover:underline">Chess.com ↗</a>
                )}
                {fideId.trim() && (
                  <a href={`https://ratings.fide.com/profile/${encodeURIComponent(fideId.trim())}`} target="_blank" rel="noreferrer" className="text-brand-300 hover:underline">FIDE ↗</a>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-surface-700">
              <Button type="submit" disabled={saving}>
                <Save className="w-4 h-4" />
                {saving ? t('Saving...') : t('Save Changes')}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
