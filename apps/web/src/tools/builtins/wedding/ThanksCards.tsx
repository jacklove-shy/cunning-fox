import { fontById, money, type GiftEntry, type WeddingMeta } from './types';

interface Props {
  meta: WeddingMeta;
  entries: GiftEntry[];
  fontId: string;
  templateId: string;
  thanksTemplate: string;
}

const TPL_BG: Record<string, { bg: string; ink: string; sub: string; border: string }> = {
  redgold: { bg: '#fbf3e4', ink: '#7c1f1a', sub: '#a8542a', border: '#c9a15c' },
  plain: { bg: '#ffffff', ink: '#3a3a3a', sub: '#999', border: '#e6e6e6' },
  rice: { bg: '#f6efdd', ink: '#4a3f35', sub: '#8d7f6d', border: '#d8c9a8' },
  west: { bg: '#ffffff', ink: '#262626', sub: '#8b8b8b', border: '#dfe3e8' },
};

/** 答谢卡：A4 一页 4 张（2×2），手写体致谢，随单打印 */
export function ThanksCards({ meta, entries, fontId, templateId, thanksTemplate }: Props) {
  const font = fontById(fontId);
  const t = TPL_BG[templateId] || TPL_BG.redgold;
  const names = meta.groom && meta.bride ? `${meta.groom} & ${meta.bride}` : '新人';
  const thanks = (name: string) => thanksTemplate.replace(/\{name\}/g, name).replace(/\{amount\}/g, '');
  const pages: GiftEntry[][] = [];
  for (let i = 0; i < entries.length; i += 4) pages.push(entries.slice(i, i + 4));

  return (
    <div className="wedding-cards-wrap">
      <style>{`
        .wedding-cards-wrap { overflow: auto; padding: 8px 0 24px; }
        .wedding-cards-page { width: 210mm; min-height: 297mm; box-sizing: border-box; margin: 0 auto 20px; padding: 12mm;
          display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: 128mm; gap: 8mm;
          background: #fff; box-shadow: 0 10px 32px -12px rgba(0,0,0,.45); }
        .thanks-card { border: 1px solid; border-radius: 10px; padding: 12mm 10mm; display: flex; flex-direction: column; }
        .thanks-card .tc-to { font-size: 20px; margin-bottom: 8mm; }
        .thanks-card .tc-body { font-size: 16px; line-height: 2; flex: 1; white-space: pre-wrap; }
        .thanks-card .tc-from { font-size: 15px; text-align: right; margin-top: 6mm; }
        .thanks-empty { text-align: center; opacity: .45; padding: 40mm 0; grid-column: 1 / -1; }
        @media print {
          body * { visibility: hidden !important; }
          #wedding-cards, #wedding-cards * { visibility: visible !important; }
          #wedding-cards { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
          .wedding-cards-wrap { overflow: visible; padding: 0; }
          .wedding-cards-page { margin: 0 auto; box-shadow: none; page-break-after: always; break-after: page; }
          .wedding-cards-page:last-child { page-break-after: auto; break-after: auto; }
          .wedding-cards-page, .wedding-cards-page * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
      <div id="wedding-cards" style={{ fontFamily: font.css }}>
        {pages.length === 0 && (
          <div className="wedding-cards-page">
            <div className="thanks-empty">先在「礼账」页勾选要致谢的来宾</div>
          </div>
        )}
        {pages.map((rows, pi) => (
          <div key={pi} className="wedding-cards-page" style={{ background: t.bg }}>
            {rows.map((e) => (
              <div key={e.id} className="thanks-card" style={{ borderColor: t.border, background: t.bg, color: t.ink }}>
                <div className="tc-to">致 {e.name}：</div>
                <div className="tc-body">{thanks(e.name)}</div>
                <div className="tc-from" style={{ color: t.sub }}>
                  —— {names}
                  {meta.date ? ` ${meta.date}` : ''}
                </div>
              </div>
            ))}
            {rows.length < 4 && Array.from({ length: 4 - rows.length }).map((_, i) => <div key={`blank${i}`} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 打印前确保字体加载完成，避免打出兜底字体 */
export async function printAfterFonts(): Promise<void> {
  try {
    if (document.fonts?.ready) await document.fonts.ready;
  } catch { /* ignore */ }
  window.print();
}
