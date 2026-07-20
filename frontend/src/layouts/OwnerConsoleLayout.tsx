import { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSystemSettings } from '../hooks/useSystemSettings';
import { OWNER_NAV } from './navConfig';

export default function OwnerConsoleLayout({ title, children }: { title: string; children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const systemSettings = useSystemSettings();

  const doLogout = () => {
    logout();
    navigate('/login');
  };

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
              <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 10.5, lineHeight: 1.2 }}>System Owner Console</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 20px 8px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', color: 'rgba(255,255,255,.35)' }}>PLATFORM</div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {OWNER_NAV.map((item) => (
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
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: 10, borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <button
            onClick={doLogout}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, border: 'none', background: 'transparent', color: 'rgba(255,255,255,.6)', fontSize: 12.5, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            ออกจากระบบ
          </button>
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
        <div style={{ height: 60, flex: 'none', background: '#fff', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', gap: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--c-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
              {(user?.name || 'O').slice(0, 2).toUpperCase()}
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{user?.name}</div>
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
