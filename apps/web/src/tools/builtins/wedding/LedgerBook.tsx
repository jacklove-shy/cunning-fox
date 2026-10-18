import { fontById, jitterFor, money, sideLabel, formLabel, displayName, toChineseAmount, type GiftEntry, type WeddingMeta } from './types';

interface Props {
  meta: WeddingMeta;
  entries: GiftEntry[];
  fontId: string;
  templateId: string;
  rowsPerPage: number;
  jitter: boolean;
}

const TPL: Record<string, { bg: string; ink: string; sub: string; line: string; accent: string; head: string }> = {
  redgold: { bg: '#9e2b25', ink: '#f6e3b6', sub: '#e8c98a', line: 'rgba(246,227,182,.45)', accent: '#f6e3b6', head: 'rgba(246,227,182,.14)' },
  plain: { bg: '#ffffff', ink: '#3a3a3a', sub: '#8a8a8a', line: '#e3d5d0', accent: '#b03a2e', head: 'rgba(176,58,46,.06)' },
  rice: { bg: '#f3e9d2', ink: '#4a3f35', sub: '#8d7f6d', line: 'rgba(74,63,53,.28)', accent: '#8c3b2e', head: 'rgba(74,63,53,.06)' },
  west: { bg: '#ffffff', ink: '#262626', sub: '#8b8b8b', line: '#dfe3e8', accent: '#2f6bff', head: 'rgba(47,107,255,.05)' },
};

/**
 * 礼账簿成册渲染：A4 封面 + 分页明细（每页小计、末页总计）。
 * 打印时只输出 #wedding-book（见组件内 print 样式），卡纸背景色强制输出。
 */
export function LedgerBook({ meta, entries, fontId, templateId, rowsPerPage, jitter }: Props) {
  const font = fontById(fontId);
  const t = TPL[templateId] || TPL.redgold;
  const j = (i: number) => (jitter ? jitterFor(i) : 'none');

  const pages: GiftEntry[][] = [];
  for (let i = 0; i < entries.length; i += rowsPerPage) pages.push(entries.slice(i, i + rowsPerPage));
  if (!pages.length) pages.push([]);
  const grand = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const title = meta.groom && meta.bride ? `${meta.groom} ❤ ${meta.bride}` : '新婚之喜';
  const subLine = [meta.banquet, meta.venue, meta.date].filter(Boolean).join(' · ');

  return (
    <div className="wedding-book-wrap">
      <style>{`
        .wedding-book-wrap { overflow: auto; padding: 8px 0 24px; }
        .wedding-page {
          width: 210mm; min-height: 297mm; box-sizing: border-box;
          margin: 0 auto 20px; padding: 14mm 14mm 12mm; position: relative;
          box-shadow: 0 10px 32px -12px rgba(0,0,0,.45); border-radius: 2px;
        }
        .wedding-cover { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
        .wedding-cover .w-title { font-size: 64px; letter-spacing: .18em; margin: 6px 0 2px; text-indent: .18em; }
        .wedding-cover .w-sub { font-size: 20px; opacity: .92; }
        .wedding-cover .w-names { font-size: 34px; margin-top: 34px; }
        .wedding-cover .w-meta { font-size: 15px; margin-top: 10px; opacity: .8; }
        .wedding-cover .w-seal {
          margin-top: 44px; padding: 8px 18px; border: 2px solid currentColor; border-radius: 6px;
          font-size: 18px; letter-spacing: .3em; text-indent: .3em; transform: rotate(-3deg); opacity: .9;
        }
        .wedding-head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid; padding-bottom: 8px; margin-bottom: 6px; }
        .wedding-table { width: 100%; border-collapse: collapse; font-size: 16px; }
        .wedding-table th { font-size: 13px; font-weight: 600; padding: 7px 6px; text-align: left; opacity: .75; }
        .wedding-table td { padding: 6.5px 6px; border-bottom: 1px solid; }
        .wedding-table td.num, .wedding-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
        .wedding-table tr.w-jitter { display: table-row; }
        .wedding-total { margin-top: 8px; text-align: right; font-size: 17px; }
        .wedding-foot { position: absolute; left: 14mm; right: 14mm; bottom: 8mm; display: flex; justify-content: space-between; font-size: 12px; opacity: .66; }
        .w-blank { text-align: center; opacity: .4; padding: 30px 0; }
        @media print {
          body * { visibility: hidden !important; }
          #wedding-book, #wedding-book * { visibility: visible !important; }
          #wedding-book { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
          .wedding-book-wrap { overflow: visible; padding: 0; }
          .wedding-page { margin: 0 auto; box-shadow: none; border-radius: 0; page-break-after: always; break-after: page; }
          .wedding-page:last-child { page-break-after: auto; break-after: auto; }
          .wedding-page, .wedding-page * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
      <div id="wedding-book" style={{ fontFamily: font.css, background: t.bg, color: t.ink }}>
        {/* 封面 */}
        <div className="wedding-page wedding-cover" style={{ background: t.bg, color: t.ink }}>
          <div className="w-sub" style={{ letterSpacing: '.5em', textIndent: '.5em' }}>佳期</div>
          <div className="w-title">礼账簿</div>
          <div className="w-names">{title}</div>
          {subLine && <div className="w-meta">{subLine}</div>}
          <div className="w-seal">簿录鸿仪</div>
          {meta.recorder && <div className="w-meta" style={{ marginTop: 26 }}>司账人：{meta.recorder}</div>}
        </div>

        {/* 明细页 */}
        {pages.map((rows, pi) => {
          const sub = rows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
          const startIdx = pi * rowsPerPage;
          return (
            <div key={pi} className="wedding-page" style={{ background: t.bg, color: t.ink }}>
              <div className="wedding-head" style={{ borderColor: t.line }}>
                <span style={{ fontSize: 22 }}>礼账簿 · {title}</span>
                <span style={{ fontSize: 13, opacity: .75 }}>{subLine}</span>
              </div>
              <table className="wedding-table">
                <thead>
                  <tr style={{ background: t.head }}>
                    <th style={{ width: '8%' }}>序</th>
                    <th style={{ width: '32%' }}>嘉宾</th>
                    <th className="num" style={{ width: '26%' }}>礼金</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody style={{ borderColor: t.line }}>
                  {rows.length === 0 && (
                    <tr><td colSpan={4} className="w-blank">（暂无记录）</td></tr>
                  )}
                  {rows.map((e, ri) => {
                    const subInfo = [e.relation, sideLabel(e.side), formLabel(e.form)].filter(Boolean).join(' · ');
                    const memo = [e.gift, e.note].filter(Boolean).join('；');
                    return (
                      <tr key={e.id} className="w-jitter" style={{ transform: j(startIdx + ri) }}>
                        <td style={{ opacity: .6 }}>{startIdx + ri + 1}</td>
                        <td>
                          <div style={{ fontSize: 18, lineHeight: 1.3 }}>{displayName(e)}</div>
                          <div style={{ fontSize: 11, opacity: .55, marginTop: 1 }}>{subInfo}</div>
                        </td>
                        <td className="num">
                          <div style={{ fontSize: 17 }}>{money(e.amount)}</div>
                          {e.amount > 0 && (
                            <div style={{ fontSize: 10.5, opacity: .68, marginTop: 1 }}>
                              {toChineseAmount(e.amount)}
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: 12, opacity: .8 }}>{memo}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="wedding-total" style={{ color: t.accent }}>
                本页小计：{money(sub)}
                {pi === pages.length - 1 && entries.length > 0 && <>　·　总计：{money(grand)}</>}
              </div>
              <div className="wedding-foot">
                <span>司账人：{meta.recorder || '——'}</span>
                <span>第 {pi + 1} 页 / 共 {pages.length} 页</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
