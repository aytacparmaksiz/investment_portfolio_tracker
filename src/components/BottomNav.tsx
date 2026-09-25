import { useNavigate, useLocation } from 'react-router-dom';

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/', icon: '📊', label: 'Portföy' },
    { path: '/performans', icon: '📈', label: 'Performans' },
    { path: '/analitik-varliklar', icon: '📋', label: 'Varlıklar' },
    { path: '/hedefler', icon: '🎯', label: 'Hedefler' },
    { path: '/varliklar', icon: '➕', label: 'İşlem' },
  ];

  return (
    <nav className="bottom-nav-container">
      <div className="bottom-nav-content">
        {navItems.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
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
              <span style={{ fontSize: '20px', lineHeight: 1 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
