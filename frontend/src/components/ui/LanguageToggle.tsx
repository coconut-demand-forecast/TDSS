import { useLanguage } from '../../context/LanguageContext';

export default function LanguageToggle({ dark = false }: { dark?: boolean }) {
  const { language, setLanguage } = useLanguage();

  const btnStyle = (active: boolean) => ({
    border: 'none',
    background: active ? (dark ? 'rgba(215,25,32,.25)' : 'var(--c-accent)') : 'transparent',
    color: active ? (dark ? '#fff' : '#fff') : dark ? 'rgba(255,255,255,.55)' : 'var(--c-text-muted)',
    fontSize: 11.5,
    fontWeight: 700,
    padding: '4px 9px',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
  });

  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: 2,
        borderRadius: 8,
        background: dark ? 'rgba(255,255,255,.06)' : '#f0f0f0',
        border: dark ? '1px solid rgba(255,255,255,.1)' : '1px solid var(--c-border)',
      }}
    >
      <button type="button" style={btnStyle(language === 'th')} onClick={() => setLanguage('th')}>
        ไทย
      </button>
      <button type="button" style={btnStyle(language === 'en')} onClick={() => setLanguage('en')}>
        EN
      </button>
    </div>
  );
}
