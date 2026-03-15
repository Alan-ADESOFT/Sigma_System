import { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';

const CONTENT_TYPES = [
  { value: 'post', label: 'Post (Imagem)' },
  { value: 'carousel', label: 'Carrossel' },
  { value: 'reel', label: 'Reel (Video)' },
  { value: 'story', label: 'Story' },
];

const CONTENT_STATUSES = [
  { value: 'idea', label: 'Ideia', color: '#9CA3AF' },
  { value: 'draft', label: 'Rascunho', color: '#F59E0B' },
  { value: 'approved', label: 'Aprovado', color: '#10B981' },
  { value: 'scheduled', label: 'Agendado', color: '#6366F1' },
  { value: 'published', label: 'Publicado', color: '#3B82F6' },
  { value: 'failed', label: 'Falhou', color: '#EF4444' },
];

export default function PublishPage() {
  const [contents, setContents] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  // Modal salvar conteudo
  const [showForm, setShowForm] = useState(false);

  // Painel publicar agora (direto, sem salvar no banco)
  const [quickPublish, setQuickPublish] = useState({
    accountId: '',
    caption: '',
    imageUrl: '',
    localPath: '',
    uploading: false,
    status: null, // null | 'publishing' | 'success' | 'error'
    message: '',
  });

  // Form salvar conteudo
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'post',
    status: 'draft',
    hashtags: '',
    accountId: '',
    scheduledAt: '',
    mediaUrls: [],
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [contentsRes, accountsRes] = await Promise.all([
        fetch('/api/contents'),
        fetch('/api/accounts'),
      ]);
      const contentsData = await contentsRes.json();
      const accountsData = await accountsRes.json();

      if (contentsData.success) setContents(contentsData.contents || []);
      if (accountsData.success) {
        const accs = accountsData.accounts || [];
        setAccounts(accs);
        if (accs.length > 0) {
          const firstId = accs[0].id;
          setFormData((prev) => ({ ...prev, accountId: firstId }));
          setQuickPublish((prev) => ({ ...prev, accountId: firstId }));
        }
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }

  // Upload de imagem para publicação rápida
  async function handleQuickUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setQuickPublish((prev) => ({ ...prev, uploading: true, imageUrl: '', localPath: '' }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        setQuickPublish((prev) => ({
          ...prev,
          imageUrl: data.url,       // URL absoluta para a Meta
          localPath: data.localPath, // URL relativa para preview local
          uploading: false,
        }));
      } else {
        setQuickPublish((prev) => ({ ...prev, uploading: false }));
        alert('Falha no upload: ' + (data.error || 'erro desconhecido'));
      }
    } catch (err) {
      setQuickPublish((prev) => ({ ...prev, uploading: false }));
      alert('Erro no upload: ' + err.message);
    }
  }

  // Publicar agora diretamente no Instagram
  async function handleQuickPublish() {
    const { accountId, caption, imageUrl } = quickPublish;

    if (!accountId) return alert('Selecione uma conta');
    if (!imageUrl) return alert('Faca o upload de uma imagem primeiro');

    const account = accounts.find((a) => a.id === accountId);
    if (!account?.oauthToken) {
      return alert('Conta sem token Meta. Conecte o Instagram primeiro em Configuracoes.');
    }

    setQuickPublish((prev) => ({ ...prev, status: 'publishing', message: '' }));

    try {
      const res = await fetch('/api/meta-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: account.oauthToken,
          imageUrl,
          caption: caption || '',
        }),
      });
      const data = await res.json();

      if (data.success) {
        setQuickPublish((prev) => ({
          ...prev,
          status: 'success',
          message: `Publicado! ID: ${data.id || 'ok'}`,
        }));
      } else {
        setQuickPublish((prev) => ({
          ...prev,
          status: 'error',
          message: data.error || 'Erro desconhecido',
        }));
      }
    } catch (err) {
      setQuickPublish((prev) => ({
        ...prev,
        status: 'error',
        message: err.message,
      }));
    }
  }

  function resetQuickPublish() {
    setQuickPublish((prev) => ({
      ...prev,
      caption: '',
      imageUrl: '',
      localPath: '',
      status: null,
      message: '',
    }));
  }

  // Upload no formulario de salvar conteudo
  async function handleFormUpload(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const uploadedUrls = [];
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) uploadedUrls.push(data.url);
      } catch (err) {
        console.error('Erro no upload:', err);
      }
    }

    setFormData((prev) => ({
      ...prev,
      mediaUrls: [...prev.mediaUrls, ...uploadedUrls],
    }));
  }

  async function handleSave() {
    if (!formData.title.trim()) return alert('Titulo obrigatorio');
    if (formData.mediaUrls.length === 0) return alert('Adicione pelo menos uma midia');

    try {
      const hashtags = formData.hashtags
        .split(/[,\s]+/)
        .filter(Boolean)
        .map((h) => (h.startsWith('#') ? h : `#${h}`));

      const payload = {
        title: formData.title,
        description: formData.description || null,
        type: formData.type,
        status: formData.status,
        hashtags,
        mediaUrls: formData.mediaUrls,
        accountId: formData.accountId || null,
        scheduledAt: formData.scheduledAt ? new Date(formData.scheduledAt).toISOString() : null,
        order: 0,
      };

      const res = await fetch('/api/contents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        setShowForm(false);
        resetForm();
        loadData();
      } else {
        alert('Erro ao salvar: ' + (data.error || 'erro desconhecido'));
      }
    } catch (err) {
      alert('Erro: ' + err.message);
    }
  }

  async function handlePublishContent(contentId) {
    setPublishing(true);
    try {
      const content = contents.find((c) => c.id === contentId);
      if (!content) return;

      const account = accounts.find((a) => a.id === content.accountId);
      if (!account?.oauthToken) {
        alert('Conta sem token Meta. Conecte o Instagram em Configuracoes.');
        return;
      }

      const imageUrl = content.mediaUrls?.[0];
      if (!imageUrl) {
        alert('Conteudo sem midia');
        return;
      }

      const caption = [content.title, content.description, (content.hashtags || []).join(' ')]
        .filter(Boolean)
        .join('\n\n');

      const res = await fetch('/api/meta-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: account.oauthToken, imageUrl, caption }),
      });
      const data = await res.json();

      if (data.success) {
        alert('Publicado com sucesso!');
        loadData();
      } else {
        alert('Erro: ' + data.error);
      }
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setPublishing(false);
    }
  }

  function resetForm() {
    setFormData({
      title: '',
      description: '',
      type: 'post',
      status: 'draft',
      hashtags: '',
      accountId: accounts[0]?.id || '',
      scheduledAt: '',
      mediaUrls: [],
    });
  }

  function removeMedia(index) {
    setFormData((prev) => ({
      ...prev,
      mediaUrls: prev.mediaUrls.filter((_, i) => i !== index),
    }));
  }

  const qpStatusColor = {
    success: 'var(--success)',
    error: 'var(--danger)',
    publishing: 'var(--accent)',
  };

  return (
    <DashboardLayout activeTab="publish">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Publicacao</h1>
          <p className="page-subtitle">Publique agora ou agende conteudo para o Instagram</p>
        </div>
        <button className="btn btn-secondary" onClick={() => setShowForm(true)}>
          + Salvar Conteudo
        </button>
      </div>

      {/* ========== PUBLICAR AGORA (direto) ========== */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Publicar Agora</h3>
          <span className="text-muted text-sm">Upload de imagem + legenda → publica diretamente no Instagram</span>
        </div>

        {accounts.length === 0 ? (
          <p className="text-muted" style={{ padding: '16px 0' }}>
            Nenhuma conta Instagram conectada.{' '}
            <a href="/dashboard/settings" style={{ color: 'var(--accent)' }}>Conecte em Configuracoes</a>
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Selecionar conta */}
            <div>
              <label className="label">Conta Instagram</label>
              <select
                className="select"
                value={quickPublish.accountId}
                onChange={(e) => setQuickPublish((prev) => ({ ...prev, accountId: e.target.value }))}
                style={{ maxWidth: 320 }}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.handle})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {/* Upload da imagem */}
              <div style={{ flex: '0 0 auto' }}>
                <label className="label">Imagem</label>
                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 160,
                    height: 160,
                    border: '2px dashed var(--border)',
                    borderRadius: 12,
                    cursor: 'pointer',
                    background: 'var(--bg-secondary)',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  {quickPublish.localPath ? (
                    <img
                      src={quickPublish.localPath}
                      alt="preview"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : quickPublish.uploading ? (
                    <div className="spinner" />
                  ) : (
                    <>
                      <span style={{ fontSize: 32, marginBottom: 8 }}>+</span>
                      <span className="text-sm text-muted">Clique para enviar</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleQuickUpload}
                    disabled={quickPublish.uploading}
                  />
                </label>
                {quickPublish.imageUrl && (
                  <p className="text-sm text-muted" style={{ marginTop: 4, wordBreak: 'break-all', maxWidth: 160 }}>
                    URL pronta para Meta
                  </p>
                )}
              </div>

              {/* Legenda */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <label className="label">Legenda / Caption</label>
                <textarea
                  className="textarea"
                  rows={6}
                  value={quickPublish.caption}
                  onChange={(e) => setQuickPublish((prev) => ({ ...prev, caption: e.target.value }))}
                  placeholder="Escreva a legenda do post... #hashtags"
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>

            {/* Status feedback */}
            {quickPublish.status && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: `${qpStatusColor[quickPublish.status]}22`,
                  border: `1px solid ${qpStatusColor[quickPublish.status]}`,
                  color: qpStatusColor[quickPublish.status],
                  fontWeight: 500,
                }}
              >
                {quickPublish.status === 'publishing' && 'Publicando...'}
                {quickPublish.status === 'success' && `Publicado com sucesso! ${quickPublish.message}`}
                {quickPublish.status === 'error' && `Erro: ${quickPublish.message}`}
              </div>
            )}

            {/* Acoes */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-instagram"
                onClick={handleQuickPublish}
                disabled={quickPublish.status === 'publishing' || quickPublish.uploading}
              >
                {quickPublish.status === 'publishing' ? 'Publicando...' : 'Publicar Agora'}
              </button>
              {(quickPublish.imageUrl || quickPublish.caption || quickPublish.status) && (
                <button className="btn btn-secondary" onClick={resetQuickPublish}>
                  Limpar
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========== KPIs ========== */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">Total</span>
          <span className="kpi-value">{contents.length}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Agendados</span>
          <span className="kpi-value" style={{ color: 'var(--accent)' }}>
            {contents.filter((c) => c.status === 'scheduled').length}
          </span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Publicados</span>
          <span className="kpi-value" style={{ color: 'var(--success)' }}>
            {contents.filter((c) => c.status === 'published').length}
          </span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Falhas</span>
          <span className="kpi-value" style={{ color: 'var(--danger)' }}>
            {contents.filter((c) => c.status === 'failed').length}
          </span>
        </div>
      </div>

      {/* ========== LISTA DE CONTEUDOS ========== */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Conteudos Salvos</h3>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : contents.length === 0 ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: 40 }}>
            Nenhum conteudo salvo ainda.
          </p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Titulo</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th>Agendado</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {contents.map((content) => {
                  const statusInfo = CONTENT_STATUSES.find((s) => s.value === content.status);
                  return (
                    <tr key={content.id}>
                      <td style={{ maxWidth: 250 }} className="truncate">
                        {content.title}
                      </td>
                      <td>
                        <span className="badge badge-info">{content.type}</span>
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{ background: `${statusInfo?.color}22`, color: statusInfo?.color }}
                        >
                          {statusInfo?.label || content.status}
                        </span>
                      </td>
                      <td className="text-sm text-muted">
                        {content.scheduledAt
                          ? new Date(content.scheduledAt).toLocaleString('pt-BR')
                          : '-'}
                      </td>
                      <td>
                        {content.status !== 'published' && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handlePublishContent(content.id)}
                            disabled={publishing}
                          >
                            {publishing ? '...' : 'Publicar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========== MODAL - SALVAR CONTEUDO ========== */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Salvar Conteudo</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="label">Titulo *</label>
                <input
                  className="input"
                  value={formData.title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Titulo do post"
                />
              </div>

              <div>
                <label className="label">Descricao / Legenda</label>
                <textarea
                  className="textarea"
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Texto da legenda..."
                />
              </div>

              <div className="grid-2">
                <div>
                  <label className="label">Tipo</label>
                  <select
                    className="select"
                    value={formData.type}
                    onChange={(e) => setFormData((prev) => ({ ...prev, type: e.target.value }))}
                  >
                    {CONTENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Status</label>
                  <select
                    className="select"
                    value={formData.status}
                    onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
                  >
                    {CONTENT_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Conta</label>
                <select
                  className="select"
                  value={formData.accountId}
                  onChange={(e) => setFormData((prev) => ({ ...prev, accountId: e.target.value }))}
                >
                  <option value="">Selecione...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.handle})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Hashtags (separadas por virgula)</label>
                <input
                  className="input"
                  value={formData.hashtags}
                  onChange={(e) => setFormData((prev) => ({ ...prev, hashtags: e.target.value }))}
                  placeholder="#marketing, #instagram, #ads"
                />
              </div>

              {formData.status === 'scheduled' && (
                <div>
                  <label className="label">Data/Hora de Agendamento</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={formData.scheduledAt}
                    onChange={(e) => setFormData((prev) => ({ ...prev, scheduledAt: e.target.value }))}
                  />
                </div>
              )}

              <div>
                <label className="label">Midia</label>
                <input type="file" accept="image/*,video/*" multiple onChange={handleFormUpload} />
                {formData.mediaUrls.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    {formData.mediaUrls.map((url, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <img
                          src={url}
                          alt=""
                          style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        <button
                          onClick={() => removeMedia(i)}
                          style={{
                            position: 'absolute', top: -6, right: -6,
                            width: 20, height: 20, borderRadius: '50%',
                            background: 'var(--danger)', color: 'white',
                            border: 'none', cursor: 'pointer', fontSize: 12,
                          }}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleSave}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
