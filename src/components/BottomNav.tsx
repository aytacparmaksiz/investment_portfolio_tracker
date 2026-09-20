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
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-around', padding: '10px 0 16px', zIndex: 100 }}>
      {navItems.map(item => (
        <button key={item.path} onClick={() => navigate(item.path)}
          style={{ background: 'none', color: location.pathname === item.path ? 'var(--accent)' : 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: '600', padding: '4px 8px', border: 'none', cursor: 'pointer' }}>
          <span style={{ fontSize: '18px' }}>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
};

export default BottomNav;
