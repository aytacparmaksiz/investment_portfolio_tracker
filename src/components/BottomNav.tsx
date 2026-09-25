import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  const navItems = [
    { path: '/', icon: '📊', label: 'Portföy' },
    { path: '/performans', icon: '📈', label: 'Performans' },
    { path: '/analitik-varliklar', icon: '📋', label: 'Varlıklar' },
    { path: '/hedefler', icon: '🎯', label: 'Hedefler' },
    { path: '/varliklar', icon: '➕', label: 'İşlem' },
  ];

  return (
    <nav className="bottom-nav-container" aria-label="Alt Navigasyon">
      <div className="bottom-nav-content">
        {navItems.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-current={isActive ? 'page' : undefined}
              tabIndex={0}
              style={{
                background: 'none',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: isActive ? '700' : '600',
                padding: '4px 12px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                transition: 'color 0.15s ease, transform 0.15s ease'
              }}
            >
              <span style={{ fontSize: '20px', lineHeight: 1 }} aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={toggleTheme}
          tabIndex={0}
          style={{
            background: 'none',
            color: 'var(--text-secondary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            fontWeight: '600',
            padding: '4px 12px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            transition: 'color 0.15s ease, transform 0.15s ease'
          }}
        >
          <span style={{ fontSize: '20px', lineHeight: 1 }} aria-hidden="true">
            {theme === 'dark' ? '☀️' : '🌙'}
          </span>
          <span>{theme === 'dark' ? 'Açık' : 'Koyu'}</span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;
