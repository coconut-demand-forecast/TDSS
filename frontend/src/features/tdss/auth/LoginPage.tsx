import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useSystemSettings } from '../../../hooks/useSystemSettings';
import { Button, Field, Input, LanguageToggle } from '../../../components/ui';

export default function LoginPage() {
  const { login, register, loading, user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const systemSettings = useSystemSettings();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (user) {
    navigate(user.is_system_owner ? '/tdss/owner/dashboard' : '/tdss/dashboard', { replace: true });
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (isRegister) {
        await register({ name, email, password, organization_name: orgName });
      } else {
        await login(email, password);
      }
      navigate('/tdss/dashboard');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
      <section
        style={{
          flex: 1,
          minWidth: 0,
          background: 'linear-gradient(155deg,#171717 0%,#2b2b2b 60%,#171717 100%)',
          color: '#fff',
          padding: '56px 60px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--c-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>TD</div>
            <div style={{ fontWeight: 700, fontSize: 19 }}>{systemSettings.app_display_name}</div>
          </div>
          <LanguageToggle dark />
        </div>
        <div style={{ maxWidth: 440 }}>
          <h2 style={{ fontWeight: 700, fontSize: 29, lineHeight: 1.35, margin: '0 0 18px' }}>{t('login.heroTitle')}</h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.7, color: '#d1d1d1' }}>{t('login.heroDescription')}</p>
        </div>
        <div style={{ fontSize: 11.5, color: '#999' }}>&copy; 2569 {systemSettings.app_display_name} — {t('login.footerTagline')}</div>
      </section>

      <section style={{ width: 460, flex: 'none', background: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px 56px' }}>
        <h1 style={{ fontWeight: 700, fontSize: 24, margin: '0 0 6px' }}>{isRegister ? t('login.registerTitle') : t('login.loginTitle')}</h1>
        <p style={{ fontSize: 13, color: 'var(--c-text-muted)', margin: '0 0 26px' }}>
          {isRegister ? t('login.registerSubtitle') : t('login.loginSubtitle')}
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          {isRegister && (
            <Field label={t('login.fullName')} required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
          )}
          {isRegister && (
            <Field label={t('login.orgName')} required>
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
            </Field>
          )}
          <Field label={t('login.email')} required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label={t('login.password')} required>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </Field>

          {error && <div style={{ color: 'var(--c-accent)', fontSize: 12.5 }}>{error}</div>}

          <Button type="submit" loading={loading} style={{ width: '100%', justifyContent: 'center', padding: 13, fontSize: 14 }}>
            {isRegister ? t('login.registerSubmit') : t('login.loginSubmit')}
          </Button>
        </form>

        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--c-text-muted)', marginTop: 20 }}>
          {isRegister ? t('login.haveAccount') : t('login.noOrg')}{' '}
          <button type="button" onClick={() => setIsRegister((v) => !v)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600, color: 'var(--c-accent)' }}>
            {isRegister ? t('login.switchToLogin') : t('login.switchToRegister')}
          </button>
        </div>

        <div style={{ marginTop: 28, padding: 14, background: '#f6f7f8', borderRadius: 10, fontSize: 11.5, color: 'var(--c-text-muted)', lineHeight: 1.6 }}>
          <strong>{t('login.demoAccountsLabel')}</strong> ({t('login.demoAccountsPasswordNote')}):
          <br />
          System Owner: owner@tdss.local
          <br />
          Org Admin: admin@orgone.local · Planner: planner@orgone.local · Viewer: viewer@orgone.local
        </div>
      </section>
    </div>
  );
}
