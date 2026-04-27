/**
 * components/comercial/MarkdownRender.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Markdown → React nodes (sem dangerouslySetInnerHTML, sem deps).
 * Suporta: ## h2, ### h3, **bold**, *italic*, `code`, listas - / *,
 *          listas numeradas 1. 2., parágrafos, links [txt](url).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useMemo } from 'react';

// ── Inline parser → array de nodes ──
function parseInline(text, keyPrefix = 'i') {
  const nodes = [];
  let i = 0;
  let buffer = '';
  let counter = 0;
  const push = (n) => { nodes.push(typeof n === 'string'
    ? n
    : { ...n, key: `${keyPrefix}-${counter++}` }); };
  const flushBuf = () => { if (buffer) { push(buffer); buffer = ''; } };

  while (i < text.length) {
    // Bold **
    if (text[i] === '*' && text[i + 1] === '*') {
      const close = text.indexOf('**', i + 2);
      if (close > 0) {
        flushBuf();
        push({ type: 'strong', children: parseInline(text.slice(i + 2, close), keyPrefix + 's') });
        i = close + 2;
        continue;
      }
    }
    // Italic *
    if (text[i] === '*' && text[i + 1] !== '*'
        && (i === 0 || text[i - 1] !== '*')) {
      const close = text.indexOf('*', i + 1);
      if (close > 0) {
        flushBuf();
        push({ type: 'em', children: parseInline(text.slice(i + 1, close), keyPrefix + 'e') });
        i = close + 1;
        continue;
      }
    }
    // Code `
    if (text[i] === '`') {
      const close = text.indexOf('`', i + 1);
      if (close > 0) {
        flushBuf();
        push({ type: 'code', text: text.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }
    // Link [txt](url)
    if (text[i] === '[') {
      const closeBracket = text.indexOf(']', i + 1);
      if (closeBracket > 0 && text[closeBracket + 1] === '(') {
        const closeParen = text.indexOf(')', closeBracket + 2);
        if (closeParen > 0) {
          const url = text.slice(closeBracket + 2, closeParen);
          if (/^https?:\/\//i.test(url)) {
            flushBuf();
            push({ type: 'a', href: url, children: parseInline(text.slice(i + 1, closeBracket), keyPrefix + 'a') });
            i = closeParen + 1;
            continue;
          }
        }
      }
    }
    buffer += text[i];
    i++;
  }
  flushBuf();
  return nodes;
}

function renderInline(nodes) {
  return nodes.map((n, idx) => {
    if (typeof n === 'string') return n;
    const k = n.key ?? idx;
    switch (n.type) {
      case 'strong': return <strong key={k}>{renderInline(n.children)}</strong>;
      case 'em':     return <em key={k}>{renderInline(n.children)}</em>;
      case 'code':   return <code key={k}>{n.text}</code>;
      case 'a':      return <a key={k} href={n.href} target="_blank" rel="noreferrer noopener">{renderInline(n.children)}</a>;
      default:       return null;
    }
  });
}

// ── Block parser → array de blocks ──
function parseBlocks(md) {
  const lines = String(md || '').split('\n');
  const blocks = [];
  let para = [];
  let list = null; // { type: 'ul'|'ol', items: [] }

  function flushPara() {
    if (para.length) {
      blocks.push({ type: 'p', text: para.join(' ').trim() });
      para = [];
    }
  }
  function flushList() {
    if (list) { blocks.push(list); list = null; }
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { flushPara(); flushList(); continue; }
    let m;
    if ((m = line.match(/^###\s+(.+)$/))) { flushPara(); flushList(); blocks.push({ type: 'h3', text: m[1] }); continue; }
    if ((m = line.match(/^##\s+(.+)$/)))  { flushPara(); flushList(); blocks.push({ type: 'h2', text: m[1] }); continue; }
    if ((m = line.match(/^#\s+(.+)$/)))   { flushPara(); flushList(); blocks.push({ type: 'h2', text: m[1] }); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.+)$/))) {
      flushPara();
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    if ((m = line.match(/^\s*\d+\.\s+(.+)$/))) {
      flushPara();
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}

export default function MarkdownRender({ source, className }) {
  const blocks = useMemo(() => parseBlocks(source), [source]);
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        if (b.type === 'h2') return <h2 key={i}>{renderInline(parseInline(b.text, 'h2-' + i))}</h2>;
        if (b.type === 'h3') return <h3 key={i}>{renderInline(parseInline(b.text, 'h3-' + i))}</h3>;
        if (b.type === 'p')  return <p  key={i}>{renderInline(parseInline(b.text, 'p-'  + i))}</p>;
        if (b.type === 'ul') return <ul key={i}>{b.items.map((it, j) => <li key={j}>{renderInline(parseInline(it, `ul-${i}-${j}`))}</li>)}</ul>;
        if (b.type === 'ol') return <ol key={i}>{b.items.map((it, j) => <li key={j}>{renderInline(parseInline(it, `ol-${i}-${j}`))}</li>)}</ol>;
        return null;
      })}
    </div>
  );
}
