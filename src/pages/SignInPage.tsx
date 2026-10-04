import { useState } from 'react';
import { Link, useRouter } from '@/context/RouterContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Crown, Mail, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export function SignInPage() {
  const { t } = useLanguage();
  const { navigate } = useRouter();
  const { signIn, resendSignupConfirmation } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    setResendError(null);
    const { error } = await signIn(email, password);
    if (error) {
      setError(error);
      setLoading(false);
    } else {
      navigate({ name: 'dashboard' });
    }
  }

  async function handleResendConfirmation() {
    setResending(true);
    setResendError(null);
    setNotice(null);
    const result = await resendSignupConfirmation(email);
    if (result.error) {
      setResendError(result.error);
    } else {
      setNotice('Confirmation email sent. Check your inbox and spam folder.');
    }
    setResending(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-20 pb-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <Crown className="w-6 h-6 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">{t('Welcome back')}</h1>
          <p className="text-gray-500 mt-2">{t('Sign in to your Qehwa Chess account')}</p>
        </div>

        <Card className="p-6 sm:p-8">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-error-500/10 border border-error-500/20 text-error-400 text-sm mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {t(error)}
            </div>
          )}
          {error?.toLowerCase().includes('email not confirmed') && (
            <button
              type="button"
              onClick={handleResendConfirmation}
              disabled={resending || !email}
              className="mb-4 text-sm font-medium text-brand-300 hover:text-brand-200 disabled:opacity-50"
            >
              {resending ? t('Sending confirmation email...') : t('Resend confirmation email')}
            </button>
          )}
          {notice && <p role="status" className="mb-4 text-sm text-success-400">{t(notice)}</p>}
          {resendError && <p role="alert" className="mb-4 text-sm text-error-400">{t(resendError)}</p>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-400 mb-1.5 block">{t('Email')}</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-11 pr-4 py-3 bg-surface-800 border border-surface-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-400 mb-1.5 block">{t('Password')}</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-3 bg-surface-800 border border-surface-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? t('Signing in...') : t('Sign In')}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </Button>
          </form>

          <p className="text-sm text-gray-500 text-center mt-6">
            {t("Don't have an account?")}{' '}
            <Link to={{ name: 'signup' }} className="text-brand-400 hover:underline font-medium">
              {t('Sign Up')}
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
