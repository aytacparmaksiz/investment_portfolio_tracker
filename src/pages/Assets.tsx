import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

const ASSET_TYPES = [
  { value: 'hisse', label: '🇹🇷 BIST Hisse', hasSymbol: true, symbolPlaceholder: 'THYAO, GARAN...', currency: 'TRY' },
  { value: 'usd_hisse', label: '🇺🇸 ABD Hisse', hasSymbol: true, symbolPlaceholder: 'AAPL, TSLA...', currency: 'USD' },
  { value: 'kripto', label: '₿ Kripto', hasSymbol: true, symbolPlaceholder: 'BTC, ETH...', currency: 'USD' },
  { value: 'etf', label: '📈 ETF', hasSymbol: true, symbolPlaceholder: 'SPY, QQQ...', currency: 'USD' },
  { value: 'doviz', label: '💱 Döviz/Altın', hasSymbol: true, symbolPlaceholder: 'USD, EUR, XAU...', currency: 'TRY' },
  { value: 'bes', label: '🏦 BES', hasSymbol: false, currency: 'TRY' },
  { value: 'vadeli', label: '💰 Vadeli Mevduat', hasSymbol: false, currency: 'TRY' },
];

const Assets = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [assets, setAssets] = useState([]);
  const [portfolioId, setPortfolioId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    type: 'hisse',
    name: '',
    symbol: '',
    quantity: '',
    avg_cost: '',
    manual_value: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('id')
      .eq('user_id', user.id);

    if (portfolios?.length) {
      setPortfolioId(portfolios[0].id);
      const { data } = await supabase
        .from('assets')
        .select('*, manual_values(value, recorded_at)')
        .eq('portfolio_id', portfolios[0].id)
        .order('created_at', { ascending: false });
      setAssets(data || []);
    }
    setLoading(false);
  };

  const selectedType = ASSET_TYPES.find((t) => t.value === form.type);
  const isManual = ['bes', 'vadeli'].includes(form.type);

  const handleSave = async () => {
    setError('');
    if (!form.name) return setError('Varlık adı zorunludur.');
    if (!isManual && !form.quantity) return setError('Adet zorunludur.');
    if (isManual && !form.manual_value) return setError('Değer zorunludur.');

    setSaving(true);

    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .insert({
        portfolio_id: portfolioId,
        type: form.type,
        name: form.name,
        symbol: form.symbol?.toUpperCase() || null,
        quantity: isManual ? 1 : Number(form.quantity),
        avg_cost: form.avg_cost ? Number(form.avg_cost) : null,
      })
      .select()
      .single();

    if (assetError) {
      setError('Kayıt hatası: ' + assetError.message);
      setSaving(false);
      return;
    }

    if (isManual) {
      await supabase.from('manual_values').insert({
        asset_id: asset.id,
        value: Number(form.manual_value),
      });
    }

    setSuccess('Varlık başarıyla eklendi!');
    setForm({
      type: 'hisse',
      name: '',
      symbol: '',
      quantity: '',
      avg_cost: '',
      manual_value: '',
    });
    setShowForm(false);
    fetchData();
    setSaving(false);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDelete = async (id) => {
    if (!confirm('Bu varlığı silmek istediğinize emin misiniz?')) return;
    await supabase.from('assets').delete().eq('id', id);
    fetchData();
  };

  const formatCurrency = (val) =>
    new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      maximumFractionDigits: 0,
    }).format(val);

  const ASSET_LABELS = {
    hisse: '🇹🇷 BIST',
    usd_hisse: '🇺🇸 ABD',
    kripto: '₿ Kripto',
    etf: '📈 ETF',
    doviz: '💱 Döviz',
    bes: '🏦 BES',
    vadeli: '💰 Vadeli',
  };

  return (
    <div
      style={{
        maxWidth: '480px',
        margin: '0 auto',
        padding: '16px',
        paddingBottom: '80px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          paddingTop: '16px',
        }}
      >
        <h1 style={{ fontSize: '20px', fontWeight: '700' }}>Varlıklarım</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '8px 16px',
            background: 'var(--accent)',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '600',
            fontSize: '14px',
          }}
        >
          {showForm ? 'İptal' : '+ Ekle'}
        </button>
      </div>

      {success && (
        <div
          style={{
            background: '#22c55e20',
            border: '1px solid var(--green)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px',
            color: 'var(--green)',
            fontSize: '14px',
          }}
        >
          {success}
        </div>
      )}

      {showForm && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '16px',
          }}
        >
          <p style={{ fontWeight: '600', marginBottom: '16px' }}>
            Yeni Varlık Ekle
          </p>

          {/* Tür Seçimi */}
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '6px',
                fontSize: '13px',
                color: 'var(--text-secondary)',
              }}
            >
              Varlık Türü
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {ASSET_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setForm({ ...form, type: t.value })}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    background:
                      form.type === t.value
                        ? 'var(--accent)'
                        : 'var(--bg-primary)',
                    border: `1px solid ${
                      form.type === t.value ? 'var(--accent)' : 'var(--border)'
                    }`,
                    color:
                      form.type === t.value ? 'white' : 'var(--text-secondary)',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* İsim */}
          <div style={{ marginBottom: '12px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '6px',
                fontSize: '13px',
                color: 'var(--text-secondary)',
              }}
            >
              Varlık Adı
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="örn. Türk Hava Yolları"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '15px',
              }}
            />
          </div>

          {/* Sembol */}
          {selectedType?.hasSymbol && (
            <div style={{ marginBottom: '12px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                }}
              >
                Sembol
              </label>
              <input
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                placeholder={selectedType.symbolPlaceholder}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '15px',
                }}
              />
            </div>
          )}

          {/* Adet / Manuel Değer */}
          {isManual ? (
            <div style={{ marginBottom: '12px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                }}
              >
                Güncel Değer (₺)
              </label>
              <input
                type="number"
                value={form.manual_value}
                onChange={(e) =>
                  setForm({ ...form, manual_value: e.target.value })
                }
                placeholder="150000"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '15px',
                }}
              />
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '12px',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Adet
                </label>
                <input
                  type="number"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: e.target.value })
                  }
                  placeholder="100"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '15px',
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Ort. Maliyet ({selectedType?.currency === 'USD' ? '$' : '₺'})
                </label>
                <input
                  type="number"
                  value={form.avg_cost}
                  onChange={(e) =>
                    setForm({ ...form, avg_cost: e.target.value })
                  }
                  placeholder="250.50"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '15px',
                  }}
                />
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                background: '#ef444420',
                border: '1px solid var(--red)',
                borderRadius: '8px',
                padding: '10px',
                marginBottom: '12px',
                color: 'var(--red)',
                fontSize: '13px',
              }}
            >
              {error}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%',
              padding: '12px',
              background: 'var(--accent)',
              borderRadius: '8px',
              color: 'white',
              fontWeight: '600',
              fontSize: '15px',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      )}

      {/* Varlık Listesi */}
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '20px',
        }}
      >
        <p style={{ fontWeight: '600', marginBottom: '16px' }}>
          Mevcut Varlıklar ({assets.length})
        </p>
        {assets.length === 0 ? (
          <p
            style={{
              color: 'var(--text-secondary)',
              textAlign: 'center',
              padding: '24px 0',
            }}
          >
            Henüz varlık eklenmedi
          </p>
        ) : (
          assets.map((asset) => {
            const isManualAsset = ['bes', 'vadeli'].includes(asset.type);
            const lastValue =
              asset.manual_values?.[asset.manual_values.length - 1]?.value;
            return (
              <div
                key={asset.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div>
                  <p style={{ fontWeight: '600', fontSize: '15px' }}>
                    {asset.name}
                  </p>
                  <p
                    style={{ color: 'var(--text-secondary)', fontSize: '12px' }}
                  >
                    {ASSET_LABELS[asset.type]}{' '}
                    {asset.symbol ? `• ${asset.symbol}` : ''}
                    {!isManualAsset ? ` • ${asset.quantity} adet` : ''}
                  </p>
                </div>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
                >
                  {isManualAsset && lastValue && (
                    <p style={{ fontWeight: '600', fontSize: '14px' }}>
                      {formatCurrency(lastValue)}
                    </p>
                  )}
                  <button
                    onClick={() => handleDelete(asset.id)}
                    style={{
                      background: '#ef444420',
                      border: '1px solid var(--red)',
                      borderRadius: '6px',
                      color: 'var(--red)',
                      padding: '4px 10px',
                      fontSize: '12px',
                    }}
                  >
                    Sil
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Alt Navigasyon */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-around',
          padding: '12px 0',
        }}
      >
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none',
            color: 'var(--text-secondary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
          }}
        >
          <span style={{ fontSize: '20px' }}>📊</span> Portföy
        </button>
        <button
          onClick={() => navigate('/varliklar')}
          style={{
            background: 'none',
            color: 'var(--accent)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
          }}
        >
          <span style={{ fontSize: '20px' }}>➕</span> Varlık Ekle
        </button>
      </div>
    </div>
  );
};

export default Assets;
