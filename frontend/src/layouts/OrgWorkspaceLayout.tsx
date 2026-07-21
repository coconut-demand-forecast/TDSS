import { type ReactNode, useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSystemSettings } from '../hooks/useSystemSettings';
import { LanguageToggle } from '../components/ui';
import { notificationsApi, type Notification } from '../api';
import { ORG_NAV } from './navConfig';

export default function OrgWorkspaceLayout({ title, headerExtra, children }: { title: string; headerExtra?: ReactNode; children: ReactNode }) {
  const { user, currentOrgId, setCurrentOrgId, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const systemSettings = useSystemSettings();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const membership = user?.memberships.find((m) => m.organization_id === currentOrgId);
  const role = membership?.role ?? 'viewer';
  const navItems = ORG_NAV.filter((n) => n.roles.includes(role));

  useEffect(() => {
    notificationsApi.list().then(setNotifications).catch(() => {});
  }, [currentOrgId]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = (user?.name || 'U')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden' }}>
      <aside style={{ width: 248, flex: 'none', background: 'var(--c-sidebar)', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--c-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 14 }}>
              TD
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>{systemSettings.app_display_name}</div>
              <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 10.5, lineHeight: 1.2 }}>Organization Workspace</div>
            </div>
          </div>
        </div>

        {user && user.memberships.length > 1 && (
          <div style={{ padding: '12px 16px 0' }}>
            <select
              value={currentOrgId ?? ''}
              onChange={(e) => setCurrentOrgId(Number(e.target.value))}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 12 }}
            >
              {user.memberships.map((m) => (
                <option key={m.organization_id} value={m.organization_id} style={{ color: '#000' }}>
                  {m.organization_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ padding: '16px 20px 8px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', color: 'rgba(255,255,255,.35)' }}>
          {membership?.organization_name ?? ''}
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {navItems.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: 13,
                background: isActive ? 'rgba(215,25,32,.18)' : 'transparent',
                color: isActive ? '#fff' : 'rgba(255,255,255,.65)',
                fontWeight: isActive ? 600 : 500,
              })}
            >
              {t(`nav.${item.key}`)}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '0 16px 10px' }}>
          <LanguageToggle dark />
        </div>
        <div style={{ padding: 10, borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <button
            onClick={doLogout}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, border: 'none', background: 'transparent', color: 'rgba(255,255,255,.6)', fontSize: 12.5, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {t('common.logout')}
          </button>
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
        <div style={{ height: 60, flex: 'none', background: '#fff', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', gap: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {headerExtra}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowNotifications((v) => !v)}
                style={{ position: 'relative', width: 36, height: 36, borderRadius: 9, border: '1px solid var(--c-border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                🔔
                {unreadCount > 0 && (
                  <span style={{ position: 'absolute', top: 5, right: 6, width: 7, height: 7, borderRadius: '50%', background: 'var(--c-accent)', border: '1.5px solid #fff' }} />
                )}
              </button>
              {showNotifications && (
                <div style={{ position: 'absolute', top: 44, right: 0, width: 320, background: '#fff', border: '1px solid var(--c-border)', borderRadius: 12, boxShadow: '0 12px 28px rgba(0,0,0,.14)', zIndex: 50, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, borderBottom: '1px solid #f0f0f0' }}>{t('common.notifications')}</div>
                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    {notifications.length === 0 && <div style={{ padding: 16, fontSize: 12.5, color: 'var(--c-text-faint)' }}>{t('common.noNotifications')}</div>}
                    {notifications.map((n) => (
                      <div key={n.id} style={{ padding: '11px 16px', borderTop: '1px solid #f5f5f5', fontSize: 12.5, background: n.is_read ? 'transparent' : '#fef2f2' }}>
                        <div>{n.message}</div>
                        <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 2 }}>{new Date(n.created_at).toLocaleString('th-TH')}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <div onClick={() => setShowProfileMenu((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--c-sidebar)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                  {initials}
                </div>
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{user?.name}</div>
                  <div style={{ fontSize: 10.5, color: '#9ca3af' }}>{role}</div>
                </div>
              </div>
              {showProfileMenu && (
                <div style={{ position: 'absolute', top: 44, right: 0, width: 180, background: '#fff', border: '1px solid var(--c-border)', borderRadius: 12, boxShadow: '0 12px 28px rgba(0,0,0,.14)', zIndex: 50, overflow: 'hidden' }}>
                  <button onClick={() => { setShowProfileMenu(false); navigate('/tdss/profile'); }} style={{ width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', background: '#fff', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {t('common.myProfile')}
                  </button>
                  <button onClick={doLogout} style={{ width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', background: '#fff', color: 'var(--c-accent)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', borderTop: '1px solid #f5f5f5' }}>
                    {t('common.logout')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {systemSettings.banner_message && (
          <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', color: '#92400e', padding: '8px 24px', fontSize: 12.5 }}>
            {systemSettings.banner_message}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '26px 30px' }}>{children}</div>
      </div>
    </div>
  );
}
