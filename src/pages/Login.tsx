import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const Login = () => {
  const { signIn, signUp } = useAuth();
  const { error: showError } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggleMode = () => setIsSignUp((v) => !v);

  const handleSubmit = async () => {
    setLoading(true);
    const { error } = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password);
    if (error) showError(error.message);
    setLoading(false);
  };

  const inputStyle = {
    width: '100%',
    padding: '12px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '16px',
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '14px',
    color: 'var(--text-secondary)',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '32px',
          width: '100%',
          maxWidth: '400px',
        }}
      >
        <h1
          style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}
        >
          Portföy Takip
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
          {isSignUp ? 'Yeni hesap olustur' : 'Hesabina giris yap'}
        </p>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>E-posta</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ornek@email.com"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={labelStyle}>Sifre</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="********"
            style={inputStyle}
          />
        </div>



        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px',
            background: 'var(--accent)',
            borderRadius: '8px',
            color: 'white',
            fontSize: '16px',
            fontWeight: '600',
            marginBottom: '16px',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Lutfen bekle...' : isSignUp ? 'Kayit Ol' : 'Giris Yap'}
        </button>

        <p
          style={{
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontSize: '14px',
          }}
        >
          {isSignUp ? 'Zaten hesabin var mi? ' : 'Hesabin yok mu? '}
          <button
            onClick={toggleMode}
            style={{
              background: 'none',
              color: 'var(--accent)',
              fontSize: '14px',
              textDecoration: 'underline',
            }}
          >
            {isSignUp ? 'Giris Yap' : 'Kayit Ol'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default Login;
