/**
 * pages/dashboard/image/[id].js
 * ─────────────────────────────────────────────────────────────────────────────
 * Visualização full de uma imagem específica. Reutiliza ImageDetailModal mas
 * embarcado como página inteira (sem overlay), com botão "Voltar".
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import DashboardLayout from '../../../components/DashboardLayout';
import { useNotification } from '../../../context/NotificationContext';
import { Icon } from '../../../components/image/ImageIcons';
import detailStyles from '../../../assets/style/imageGeneration.module.css';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR');
}

export default function ImageViewPage() {
  const router = useRouter();
  const { id } = router.query;
  const { notify } = useNotification();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || typeof id !== 'string') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/image/status/${id}`);
        const json = await res.json();
        if (cancelled) return;
        if (json.success) setJob(json.data);
        else notify(json.error || 'Não encontrado', 'error');
      } catch (err) {
        notify(`Erro: ${err.message}`, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, notify]);

  function download() {
    if (!job?.result_image_url) return;
    const a = document.createElement('a');
    a.href = job.result_image_url;
    a.download = `${job.id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleRegenerate() {
    try {
      const res = await fetch(`/api/image/jobs/${job.id}/regenerate`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      notify('Variação enfileirada', 'success');
      router.push(`/dashboard/image?job=${json.data.jobId}`);
    } catch (err) { notify(`Erro: ${err.message}`, 'error'); }
  }

  async function handleDelete() {
    if (!window.confirm('Apagar esta imagem?')) return;
    try {
      await fetch(`/api/image/jobs/${job.id}`, { method: 'DELETE' });
      notify('Imagem apagada', 'success');
      router.push('/dashboard/image');
    } catch (err) { notify(`Erro: ${err.message}`, 'error'); }
  }

  return (
    <DashboardLayout activeTab="image">
      <div style={{ padding: '24px 28px 60px', maxWidth: 1400, margin: '0 auto' }}>
        <Link
          href="/dashboard/image"
          className="btn btn-secondary btn-sm"
          style={{ marginBottom: 16 }}
        >
          <Icon name="arrowLeft" size={11} /> Voltar
        </Link>

        {loading ? (
          <div className="glass-card" style={{ padding: 60, textAlign: 'center' }}>
            <span className="spinner" style={{ width: 22, height: 22, margin: '0 auto 10px' }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              CARREGANDO...
            </div>
          </div>
        ) : !job ? (
          <div className="glass-card" style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Imagem não encontrada
            </div>
          </div>
        ) : (
          <div className={detailStyles.detailCard}>
            <div className={detailStyles.detailImageWrap}>
              {job.result_image_url ? (
                <img src={job.result_image_url} alt={job.raw_description?.slice(0, 80) || 'Imagem'} className={detailStyles.detailImage} />
              ) : (
                <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                  Imagem ainda não disponível
                </div>
              )}
            </div>

            <div className={detailStyles.detailMeta}>
              <div className={detailStyles.detailMetaTitle}>
                {job.format} · {job.aspect_ratio}
              </div>

              <div className={detailStyles.detailField}>
                <span className={detailStyles.detailFieldLabel}>Descrição</span>
                <span className={detailStyles.detailFieldValue}>{job.raw_description}</span>
              </div>

              {job.observations && (
                <div className={detailStyles.detailField}>
                  <span className={detailStyles.detailFieldLabel}>Observações</span>
                  <span className={detailStyles.detailFieldValue}>{job.observations}</span>
                </div>
              )}

              {job.optimized_prompt && (
                <div className={detailStyles.detailField}>
                  <span className={detailStyles.detailFieldLabel}>Prompt otimizado</span>
                  <span className={`${detailStyles.detailFieldValue} mono`} style={{ whiteSpace: 'pre-wrap' }}>{job.optimized_prompt}</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className={detailStyles.detailField}>
                  <span className={detailStyles.detailFieldLabel}>Modelo</span>
                  <span className={`${detailStyles.detailFieldValue} mono`}>{job.model}</span>
                </div>
                <div className={detailStyles.detailField}>
                  <span className={detailStyles.detailFieldLabel}>Provedor</span>
                  <span className={`${detailStyles.detailFieldValue} mono`}>{job.provider}</span>
                </div>
                <div className={detailStyles.detailField}>
                  <span className={detailStyles.detailFieldLabel}>Tempo</span>
                  <span className={`${detailStyles.detailFieldValue} mono`}>
                    {job.duration_ms ? `${(job.duration_ms / 1000).toFixed(1)}s` : '—'}
                  </span>
                </div>
                <div className={detailStyles.detailField}>
                  <span className={detailStyles.detailFieldLabel}>Custo</span>
                  <span className={`${detailStyles.detailFieldValue} mono`}>
                    {job.cost_usd ? `$${parseFloat(job.cost_usd).toFixed(4)}` : '—'}
                  </span>
                </div>
                <div className={detailStyles.detailField}>
                  <span className={detailStyles.detailFieldLabel}>Brandbook usado</span>
                  <span className={`${detailStyles.detailFieldValue} mono`}>{job.brandbook_used ? 'Sim' : 'Não'}</span>
                </div>
                <div className={detailStyles.detailField}>
                  <span className={detailStyles.detailFieldLabel}>Criada</span>
                  <span className={`${detailStyles.detailFieldValue} mono`}>{formatDate(job.created_at)}</span>
                </div>
              </div>

              <div className={detailStyles.detailActions}>
                <button type="button" className="sigma-btn-primary btn-sm" onClick={download} disabled={!job.result_image_url}>
                  <Icon name="download" size={11} /> Download
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleRegenerate}>
                  <Icon name="refresh" size={11} /> Variação
                </button>
                <button type="button" className="btn btn-danger btn-sm" onClick={handleDelete}>
                  <Icon name="trash" size={11} /> Apagar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
