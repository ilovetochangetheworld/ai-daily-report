/**
 * 小红书卡片图生成模块
 * HTML 模板 + Puppeteer 截图
 * 支持自动分页：每个板块内容多时自动拆成多张卡片
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1440;
const FONT_STACK = "'Noto Sans CJK SC','PingFang SC','Microsoft YaHei','WenQuanYi Micro Hei',sans-serif";
const BRAND_URL = 'ilovetochangetheworld.github.io/ai-daily-report';
const SECTION_AUDIENCE = {
    '产品与功能更新': '产品/增长',
    '前沿研究': '研究/模型',
    '行业展望与社会影响': '投资/战略',
    'Open-source Radar': '开发者',
    '社区信号与反共识': '选题/社群',
    'Harness Engineering': '工程团队',
    '发现机会': '创业/独立开发',
};
const SECTION_FOCUS = {
    '产品与功能更新': '看产品方向',
    '前沿研究': '看技术拐点',
    '行业展望与社会影响': '看资本/监管',
    'Open-source Radar': '看项目价值',
    '社区信号与反共识': '看真实反馈',
    'Harness Engineering': '看落地风险',
    '发现机会': '看机会窗口',
};

/**
 * 从日报 Markdown 解析出 7 板块的所有条目
 * 每条: { subtitle, summary }，summary 控制在 120 字以内
 */
function parseFullSections(markdown) {
    const rawSections = markdown.split(/(?=^## )/m).filter(s => s.startsWith('## '));
    const result = [];
    const emojiMap = {
        '产品与功能更新': '🚀',
        '前沿研究': '🔬',
        '行业展望与社会影响': '🌍',
        '开源 TOP 项目': '⭐',
        'Open-source Radar': '⭐',
        '社媒热议': '💬',
        '社区信号与反共识': '💬',
        '社媒分享': '💬',
        'Harness Engineering': '💻',
        'AI Coding & 工程': '💻',
        'AI Coding & harness 工程': '💻',
        '发现机会': '💡',
    };

    for (const sec of rawSections) {
        const titleMatch = sec.match(/^## (.+)/);
        if (!titleMatch) continue;
        let sectionTitle = titleMatch[1].trim();

        // 跳过 Top 5 信号
        if (sectionTitle.includes('Top 5') || sectionTitle.includes('📌')) continue;

        // 从标题中提取已有 emoji
        const emMatch = sectionTitle.match(/^([\u{1F300}-\u{1F9FF}])\s*/u);
        let emoji = '';
        if (emMatch) {
            emoji = emMatch[1];
            sectionTitle = sectionTitle.replace(emMatch[0], '').trim();
        }

        // 判断分析标题归属板块
        const belongMap = {
            '产品与功能更新': '产品与功能更新',
            '维度分析': '产品与功能更新',
            '前沿研究': '前沿研究',
            '下沉战': '前沿研究',
            '本地推理': '前沿研究',
            '行业展望': '行业展望与社会影响',
            '社会影响': '行业展望与社会影响',
            'Open-source': 'Open-source Radar',
            '开源 TOP': 'Open-source Radar',
            '开源TOP': 'Open-source Radar',
            '安卓化': 'Open-source Radar',
            '社媒': '社区信号与反共识',
            '社区信号': '社区信号与反共识',
            'Coding': 'Harness Engineering',
            'coding': 'Harness Engineering',
            'harness': 'Harness Engineering',
            'Harness Engineering': 'Harness Engineering',
            '发现机会': '发现机会',
        };
        let normalizedTitle = '';
        for (const [key, val] of Object.entries(belongMap)) {
            if (sectionTitle.includes(key)) { normalizedTitle = val; break; }
        }
        // 如果自身已是标准板块名就不变
        const standardNames = ['产品与功能更新', '前沿研究', '行业展望与社会影响', 'Open-source Radar', '开源 TOP 项目', '社媒热议', '社区信号与反共识', 'Harness Engineering', 'AI Coding & 工程', 'AI Coding & harness 工程', '发现机会'];
        if (standardNames.includes(sectionTitle)) {
            normalizedTitle = sectionTitle.includes('AI Coding') ? 'Harness Engineering'
                : sectionTitle === '开源 TOP 项目' ? 'Open-source Radar'
                    : sectionTitle === '社媒热议' ? '社区信号与反共识'
                        : sectionTitle;
        }
        if (!normalizedTitle) {
            // 无法归类的分析标题跳过（内容会被前面的板块捕获）
            continue;
        }

        // 如果板块已存在，追加条目；否则新建
        let existing = result.find(s => s.title === normalizedTitle);
        if (!existing) {
            existing = { emoji: emoji || emojiMap[normalizedTitle] || '📌', title: normalizedTitle, items: [] };
            result.push(existing);
        }
        if (emoji && !existing.emoji) existing.emoji = emoji;

        if (normalizedTitle === 'Open-source Radar') {
            const rankedItems = extractOpenSourceRankings(sec);
            if (rankedItems.length) {
                existing.items.push(...rankedItems);
            }
        }

        // 提取 ### 子条目
        const subs = sec.split(/(?=^### )/m).filter(s => s.startsWith('### '));
        const items = [];
        for (const sub of subs) {
            const subMatch = sub.match(/^### (.+)/);
            if (!subMatch) continue;
            let subTitle = cleanCardText(subMatch[1].replace(/^\d+\.\s*/, '').trim());
            if (normalizedTitle === 'Open-source Radar' && /top\s*5|排名表|趋势分析|趋势判断/i.test(subTitle)) {
                continue;
            }

            // 提取核心判断段落作为摘要
            const body = sub.replace(/^### .*/m, '').trim();
            let summary = '';

            const coreSummary = extractCoreSummary(body);
            if (coreSummary) summary = coreSummary;

            // 产品类条目常直接用首段加粗表达核心判断，而不写“核心判断”。
            if (!summary) {
                const firstBold = body.match(/^\s*\*\*(.+?)\*\*/s);
                if (firstBold) {
                    summary = cleanCardText(firstBold[1]);
                }
            }

            // 如果没找到核心判断，取第一段非空文本
            if (!summary) {
                const firstPara = body.split('\n\n').find(p => p.trim() && !p.trim().startsWith('-') && !p.trim().startsWith('>') && !p.trim().startsWith('**'));
                if (firstPara) {
                    summary = cleanCardText(firstPara.replace(/[\-\*]\s*/g, ''));
                }
            }

            // 补充第一条关键证据（仅当核心判断未提取到时，或 summary 极短）
            if (summary && coreSummary) {
                // 核心判断已成功提取，不再追加证据列表
            } else if (summary.length < 40) {
                const evidences = body.match(/^-\s+(.+)/gm) || [];
                for (const ev of evidences) {
                    const evText = cleanCardText(ev.replace(/^-\s+/, ''));
                    if (evText.length > 15 && !summary.includes(evText.substring(0, 15))) {
                        summary = summary ? summary + '；' + evText : evText;
                        break;
                    }
                }
            }

            // 截断到 150 字
            if (summary.length > 150) {
                summary = tidyCardText(summary.substring(0, 147)) + '…';
            }

            // 如果还是没有，从关键证据里取第一条
            if (!summary) {
                const evidence = body.match(/-\s*(.+)/);
                if (evidence) {
                    summary = cleanCardText(evidence[1]);
                    if (summary.length > 120) summary = tidyCardText(summary.substring(0, 117)) + '…';
                }
            }

            if (subTitle && summary && !existing.items.some(item => similarItem(item.subtitle, subTitle))) {
                existing.items.push({ subtitle: subTitle, summary: tidyCardText(summary) });
            }
        }

        // 也收集关键证据作为额外条目（如果 ### 条目少于2个）
        if (existing.items.length < 2) {
            const evidenceLines = sec.match(/^-\s+(.+)/gm) || [];
            for (const el of evidenceLines) {
                const text = cleanCardText(el.replace(/^-\s+/, ''));
                if (text.length > 15 && text.length < 150 && existing.items.length < 4) {
                    // 避免重复
                    if (!existing.items.some(it => it.summary.includes(text.substring(0, 20)))) {
                        existing.items.push({ subtitle: text.substring(0, 25), summary: text });
                    }
                }
            }
        }
    }

    return result;
}

/**
 * 自动分页：每张卡片最多放 MAX_ITEMS 条，超出则拆分
 */
function paginateSection(section, maxItemsPerPage = 3) {
    const pages = [];
    for (let i = 0; i < section.items.length; i += maxItemsPerPage) {
        pages.push({
            emoji: section.emoji,
            title: section.title,
            items: section.items.slice(i, i + maxItemsPerPage),
            pageNum: Math.floor(i / maxItemsPerPage) + 1,
            totalPages: Math.ceil(section.items.length / maxItemsPerPage),
        });
    }
    return pages;
}

function extractTopSignals(markdown) {
    const match = String(markdown || '').match(/^##\s+📌\s*今日 Top 5 信号\s*\n([\s\S]*?)(?=^---\s*$|^##\s+)/m);
    if (!match) return [];

    return match[1]
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('- '))
        .map((line, index) => {
            const titleMatch = line.match(/^\-\s+\*\*(.+?)\*\*/);
            const linkMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)\s*$/);
            const rawTitle = cleanCardText(titleMatch ? titleMatch[1] : line.replace(/^\-\s+/, ''));
            return {
                rank: index + 1,
                title: localizeSignalTitle(rawTitle),
                source: linkMatch ? cleanCardText(linkMatch[1]) : 'source',
            };
        })
        .filter(item => item.title)
        .slice(0, 5);
}

function deriveDailyTheme(markdown, sections, topSignals) {
    const hackerNewsCount = topSignals.filter(item => /hackernews/i.test(item.source)).length;
    if (hackerNewsCount >= 3) {
        return '开源项目密集冒头，AI IDE 与 RAG 工具升温';
    }

    const mainline = String(markdown || '').match(/\*\*今日主线\*\*[：:]\s*(.+)/);
    if (mainline?.[1]) return compactText(mainline[1], 34);

    for (const sec of sections) {
        const item = sec.items?.[0];
        if (item?.summary) return compactText(item.summary, 34);
    }

    if (topSignals[0]?.title) return compactText(topSignals[0].title, 34);
    return '今天 AI 圈最值得复盘的信号';
}

function deriveCoverInsights(sections, topSignals) {
    const insights = [];
    if (topSignals[0]?.title) {
        insights.push(`最热信号：${compactText(topSignals[0].title, 28)}`);
    }

    const oss = sections.find(section => section.title === 'Open-source Radar')?.items?.[0];
    if (oss) {
        insights.push(`开源雷达：${compactText(oss.subtitle, 30)}`);
    }

    const harness = sections.find(section => section.title === 'Harness Engineering')?.items?.[0];
    if (harness) {
        insights.push(`工程重点：${compactText(harness.subtitle, 30)}`);
    }

    const opportunity = sections.find(section => section.title === '发现机会')?.items?.[0];
    if (insights.length < 3 && opportunity) {
        insights.push(`机会窗口：${compactText(opportunity.subtitle, 30)}`);
    }

    return insights.slice(0, 3);
}

function extractOpenSourceRankings(sectionMarkdown) {
    const rows = String(sectionMarkdown || '')
        .split('\n')
        .map(line => line.trim())
        .filter(line => /^\|\s*\d+\s*\|/.test(line));

    return rows.map(line => {
        const cells = line.split('|').map(cell => cleanCardText(cell)).filter(Boolean);
        const [rank, project, type, metric, reason, audience, risk] = cells;
        if (!rank || !project || !reason) return null;

        const title = `Top${rank} ${project}`;
        const parts = [];
        if (type) parts.push(type);
        if (metric) parts.push(metric);
        parts.push(reason);
        if (audience) parts.push(`适合：${audience}`);
        if (risk) parts.push(`风险：${risk}`);

        return { subtitle: title, summary: parts.join('｜') };
    }).filter(Boolean);
}

function localizeSignalTitle(title) {
    const text = cleanCardText(title);
    const lower = text.toLowerCase();

    const known = [
        [/fastgraphrag/, 'FastGraphRAG：RAG 检索优化'],
        [/\baide\b.*ai native ide/, 'Aide：开源 AI 原生 IDE'],
        [/deta surf/, 'Deta Surf：本地优先 Notebook'],
        [/nocobase/, 'NocoBase：非 AI 工具逆势增长'],
        [/国外的旗舰模型|旗舰模型到底强在哪里/, '旗舰模型差距：怎么向老板解释'],
    ];
    for (const [pattern, replacement] of known) {
        if (pattern.test(lower) || pattern.test(text)) return replacement;
    }

    return text
        .replace(/^show\s+hn:\s*/i, '')
        .replace(/\ban open[-\s]source\b/ig, '开源')
        .replace(/\bopen[-\s]source\b/ig, '开源')
        .replace(/\blocal[-\s]first\b/ig, '本地优先')
        .replace(/\bai native\b/ig, 'AI 原生')
        .replace(/\bnotebook\b/ig, 'Notebook')
        .replace(/\bide\b/ig, 'IDE')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * 生成封面 HTML
 */
function coverHtml(date, sectionCount, totalItems, theme = '今天 AI 圈最值得看的信号', insights = []) {
    const dateLabel = date.substring(5).replace('-', '.');
    const insightItems = (insights.length ? insights : ['先看 Top 5 判断方向', 'Open-source Radar 找可试项目', 'Harness Engineering 检查工程风险'])
        .slice(0, 3)
        .map((item, index) => `
    <div class="insight-item">
      <div class="insight-num">0${index + 1}</div>
      <div class="insight-copy">${escHtml(item)}</div>
    </div>`)
        .join('\n');
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  width:${CARD_WIDTH}px; height:${CARD_HEIGHT}px;
  font-family:${FONT_STACK};
  overflow:hidden;
  background:#f8f4ec;
  color:#101828;
  position:relative;
}
.grain { position:absolute; inset:0; background-image:linear-gradient(rgba(16,24,40,.035) 1px, transparent 1px),linear-gradient(90deg,rgba(16,24,40,.035) 1px, transparent 1px); background-size:36px 36px; }
.top-bar { position:absolute; top:0; left:0; right:0; height:18px; background:#ff4d3d; }
.content { position:relative; z-index:1; padding:88px 72px; height:100%; }
.badge { display:inline-block; background:#101828; color:#fff; border-radius:999px; padding:10px 22px; font-size:24px; font-weight:800; letter-spacing:1px; margin-bottom:34px; }
.title { font-size:116px; font-weight:1000; letter-spacing:0; line-height:.95; color:#101828; margin-bottom:18px; }
.title-accent { color:#ff4d3d; }
.date { font-size:42px; color:#475467; letter-spacing:2px; font-weight:800; margin-bottom:44px; }
.hero-card { background:#fff; border:4px solid #101828; border-radius:8px; padding:34px 38px; box-shadow:12px 12px 0 #101828; margin-bottom:30px; }
.hero-kicker { font-size:23px; color:#ff4d3d; font-weight:950; margin-bottom:14px; }
.hero-title { font-size:43px; line-height:1.22; font-weight:1000; margin-bottom:18px; }
.hero-copy { font-size:26px; color:#475467; line-height:1.5; font-weight:650; }
.insights { display:flex; flex-direction:column; gap:18px; }
.insight-item {
  display:grid; grid-template-columns:78px 1fr; align-items:start; gap:18px;
  background:#fff; border:3px solid #101828; border-radius:8px; padding:22px 24px;
}
.insight-num {
  color:#fff; background:#ff4d3d; border:3px solid #101828; border-radius:8px;
  font-size:24px; font-weight:1000; text-align:center; padding:8px 0;
}
.insight-copy { font-size:30px; line-height:1.35; font-weight:950; color:#101828; }
.footer { position:absolute; bottom:58px; left:72px; right:72px; display:flex; justify-content:space-between; align-items:flex-end; border-top:3px solid #101828; padding-top:22px; }
.stats { font-size:24px; color:#101828; font-weight:850; }
.credit { font-size:18px; color:#667085; text-align:right; }
</style>
</head><body>
<div class="grain"></div>
<div class="top-bar"></div>
<div class="content">
  <div class="badge">AI DAILY · ${dateLabel}</div>
  <div class="title">AI<span class="title-accent">日报</span></div>
  <div class="date">${date}</div>
  <div class="hero-card">
    <div class="hero-kicker">今日主线</div>
    <div class="hero-title">${escHtml(theme)}</div>
    <div class="hero-copy">这一页只放结论，后面再展开项目、工程和机会。</div>
  </div>
  <div class="insights">
    ${insightItems}
  </div>
</div>
<div class="footer">
  <div class="stats">${totalItems} 条精华 · ${sectionCount} 维度</div>
  <div class="credit">${BRAND_URL}</div>
</div>
</body></html>`;
}

function topSignalsCardHtml(topSignals, date) {
    const rows = topSignals.map(item => `
      <div class="rank-row">
        <div class="rank">TOP ${item.rank}</div>
        <div class="rank-content">
          <div class="rank-title">${escHtml(compactText(item.title, 42))}</div>
          <div class="rank-meta">${escHtml(item.source)}</div>
        </div>
      </div>`).join('\n');

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  width:${CARD_WIDTH}px; height:${CARD_HEIGHT}px;
  font-family:${FONT_STACK};
  overflow:hidden;
  background:#101828;
  color:#fff;
  position:relative;
}
.grid { position:absolute; inset:0; opacity:.13; background-image:linear-gradient(rgba(255,255,255,.35) 1px, transparent 1px),linear-gradient(90deg,rgba(255,255,255,.35) 1px, transparent 1px); background-size:40px 40px; }
.content { position:relative; z-index:1; padding:70px 64px; height:100%; }
.badge { display:inline-block; color:#101828; background:#ffdb4d; border:3px solid #fff; border-radius:999px; padding:9px 18px; font-size:22px; font-weight:950; margin-bottom:24px; }
.title { font-size:64px; line-height:1.08; font-weight:1000; margin-bottom:14px; }
.subtitle { font-size:27px; line-height:1.5; color:#d0d5dd; font-weight:650; margin-bottom:34px; }
.rank-list { display:flex; flex-direction:column; gap:18px; }
.rank-row {
  display:grid; grid-template-columns:150px 1fr; gap:20px;
  background:#fff; color:#101828; border:3px solid #fff; border-radius:8px;
  padding:22px 24px; box-shadow:8px 8px 0 #ff4d3d;
}
.rank { align-self:start; background:#ff4d3d; color:#fff; border:3px solid #101828; border-radius:6px; padding:10px 8px; text-align:center; font-size:22px; font-weight:1000; }
.rank-title { font-size:29px; line-height:1.24; font-weight:950; margin-bottom:10px; }
.rank-meta { display:inline-block; color:#475467; background:#f2f4f7; border-radius:999px; padding:6px 14px; font-size:19px; font-weight:850; }
.footer { position:absolute; bottom:42px; left:64px; right:64px; display:flex; justify-content:space-between; border-top:3px solid rgba(255,255,255,.75); padding-top:18px; font-size:20px; color:#eaecf0; font-weight:800; }
</style>
</head><body>
<div class="grid"></div>
<div class="content">
  <div class="badge">先看这 5 条</div>
  <div class="title">今日 Top 5<br>信号排名</div>
  <div class="subtitle">按关注度、工程价值、趋势指向综合挑选。适合截图收藏。</div>
  <div class="rank-list">${rows}</div>
</div>
<div class="footer"><span>AI日报 · ${date}</span><span>${BRAND_URL}</span></div>
</body></html>`;
}

/**
 * 生成板块卡片 HTML（支持分页）
 */
function sectionCardHtml(page, date, globalIndex) {
    const itemsHtml = page.items.map(item => `
    <div class="card">
      <div class="card-header">
        <span class="card-bullet"></span>
        <span class="card-subtitle">${escHtml(item.subtitle)}</span>
      </div>
      <div class="label-row"><span>判断</span><p>${escHtml(item.summary)}</p></div>
      <div class="label-row"><span>关注</span><p>${escHtml(SECTION_FOCUS[page.title] || '继续跟踪')}</p></div>
      <div class="label-row compact"><span>适合</span><p>${escHtml(SECTION_AUDIENCE[page.title] || '关注 AI 的读者')}</p></div>
    </div>`).join('\n');

    const pageLabel = page.totalPages > 1 ? ` (${page.pageNum}/${page.totalPages})` : '';

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  width:${CARD_WIDTH}px; height:${CARD_HEIGHT}px;
  font-family:${FONT_STACK};
  overflow:hidden;
  background:#f7f3ea;
  color:#101828;
  position:relative;
}
.paper-grid { position:absolute; inset:0; background-image:linear-gradient(rgba(16,24,40,.035) 1px, transparent 1px),linear-gradient(90deg,rgba(16,24,40,.035) 1px, transparent 1px); background-size:36px 36px; }
.top-bar {
  position:absolute; top:0; left:0; right:0; height:14px;
  background:#ff4d3d;
}
.content {
  position:relative; z-index:1;
  padding:56px 58px;
}
.section-header { margin-bottom:22px; }
.eyebrow { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
.section-emoji { font-size:52px; display:block; }
.section-meta {
  font-size:19px; color:#101828; background:#fff;
  border:2px solid #101828; border-radius:999px; padding:8px 16px;
  font-weight:850;
}
.section-title {
  font-size:48px; font-weight:1000; line-height:1.12;
  color:#101828; letter-spacing:0;
}
.header-line {
  width:130px; height:8px; border-radius:999px;
  background:#ff4d3d; margin-top:18px;
}
.cards { display:flex; flex-direction:column; gap:14px; }
.card {
  background:#fff; border:3px solid #101828;
  border-radius:8px; padding:18px 22px;
  box-shadow:8px 8px 0 rgba(16,24,40,.12);
}
.card-header {
  display:flex; align-items:center; gap:10px;
  margin-bottom:12px;
}
.card-bullet {
  width:24px; height:24px; border-radius:50%;
  background:#ff4d3d; border:3px solid #101828; flex-shrink:0;
}
.card-subtitle { font-size:26px; line-height:1.24; font-weight:950; color:#101828; }
.label-row { display:grid; grid-template-columns:70px 1fr; gap:12px; padding-left:34px; align-items:start; }
.label-row + .label-row { margin-top:8px; }
.label-row span {
  display:flex; align-items:center; justify-content:center;
  min-height:28px; color:#fff; background:#101828; border-radius:6px;
  padding:4px 8px; font-size:18px; line-height:1; font-weight:900; text-align:center;
}
.label-row p { font-size:20px; line-height:1.42; color:#475467; font-weight:650; padding-top:1px; }
.label-row.compact p { color:#101828; font-weight:850; }
.footer {
  position:absolute; bottom:40px; left:60px; right:60px;
  display:flex; justify-content:space-between; align-items:center;
  border-top:3px solid #101828; padding-top:18px;
}
.footer-left { font-size:21px; color:#101828; font-weight:850; }
.footer-right { font-size:16px; color:#667085; }
</style>
</head><body>
<div class="paper-grid"></div>
<div class="top-bar"></div>
<div class="content">
  <div class="section-header">
    <div class="eyebrow">
      <span class="section-emoji">${page.emoji || '📌'}</span>
      <div class="section-meta">SECTION ${globalIndex}</div>
    </div>
    <div class="section-title">${escHtml(page.title)}${pageLabel}</div>
    <div class="header-line"></div>
  </div>
  <div class="cards">
    ${itemsHtml}
  </div>
</div>
<div class="footer">
  <span class="footer-left">AI日报 · ${date}</span>
  <span class="footer-right">${BRAND_URL}</span>
</div>
</body></html>`;
}

function actionCardHtml(date, sections, topSignals) {
    const ossItems = sections.find(s => s.title === 'Open-source Radar')?.items || [];
    const oss = ossItems.find(item => !/top\s*5|排名表/i.test(item.subtitle))?.subtitle || topSignals[0]?.title || 'Top 5 项目';
    const harness = sections.find(s => s.title === 'Harness Engineering')?.items?.[0]?.subtitle || 'Harness Engineering';
    const opportunity = sections.find(s => s.title === '发现机会')?.items?.[0]?.subtitle || '机会窗口';

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  width:${CARD_WIDTH}px; height:${CARD_HEIGHT}px;
  font-family:${FONT_STACK};
  overflow:hidden;
  background:#f8f4ec;
  color:#101828;
  position:relative;
}
.paper-grid { position:absolute; inset:0; background-image:linear-gradient(rgba(16,24,40,.035) 1px, transparent 1px),linear-gradient(90deg,rgba(16,24,40,.035) 1px, transparent 1px); background-size:36px 36px; }
.content { position:relative; z-index:1; padding:72px 64px; height:100%; }
.kicker { display:inline-block; background:#101828; color:#fff; border-radius:999px; padding:10px 20px; font-size:23px; font-weight:950; margin-bottom:26px; }
.title { font-size:66px; line-height:1.08; font-weight:1000; margin-bottom:18px; }
.subtitle { font-size:28px; color:#475467; line-height:1.45; font-weight:650; margin-bottom:40px; }
.todo { display:flex; flex-direction:column; gap:22px; }
.todo-item { background:#fff; border:3px solid #101828; border-radius:8px; padding:26px 28px; box-shadow:9px 9px 0 rgba(16,24,40,.13); }
.todo-head { display:flex; align-items:center; gap:14px; margin-bottom:12px; }
.num { width:48px; height:48px; display:flex; align-items:center; justify-content:center; border-radius:50%; background:#ff4d3d; color:#fff; border:3px solid #101828; font-size:24px; font-weight:1000; }
.todo-title { font-size:32px; font-weight:1000; }
.todo-copy { font-size:24px; line-height:1.48; color:#475467; font-weight:650; padding-left:62px; }
.footer { position:absolute; bottom:42px; left:64px; right:64px; display:flex; justify-content:space-between; border-top:3px solid #101828; padding-top:18px; font-size:20px; color:#475467; font-weight:850; }
</style>
</head><body>
<div class="paper-grid"></div>
<div class="content">
  <div class="kicker">收藏后怎么用</div>
  <div class="title">3 个复盘动作</div>
  <div class="subtitle">别只看热闹，把今天的信号转成选题、项目和工程决策。</div>
  <div class="todo">
    <div class="todo-item">
      <div class="todo-head"><div class="num">1</div><div class="todo-title">试一个项目</div></div>
      <div class="todo-copy">${escHtml(compactText(oss, 48))}</div>
    </div>
    <div class="todo-item">
      <div class="todo-head"><div class="num">2</div><div class="todo-title">查一处工程风险</div></div>
      <div class="todo-copy">${escHtml(compactText(harness, 48))}</div>
    </div>
    <div class="todo-item">
      <div class="todo-head"><div class="num">3</div><div class="todo-title">留一个机会假设</div></div>
      <div class="todo-copy">${escHtml(compactText(opportunity, 48))}</div>
    </div>
  </div>
</div>
<div class="footer"><span>AI日报 · ${date}</span><span>${BRAND_URL}</span></div>
</body></html>`;
}

/**
 * 生成所有卡片：封面 + 各板块（自动分页）
 */
async function generateCoverAndCards(date, sectionsOrMarkdown, outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });

    // 如果传入的是 markdown 字符串，先解析
    let sections;
    if (typeof sectionsOrMarkdown === 'string' && sectionsOrMarkdown.includes('## ')) {
        sections = parseFullSections(sectionsOrMarkdown);
    } else if (Array.isArray(sectionsOrMarkdown)) {
        sections = sectionsOrMarkdown;
    } else {
        sections = getDefaultSections();
    }

    const topSignals = typeof sectionsOrMarkdown === 'string' ? extractTopSignals(sectionsOrMarkdown) : [];
    const theme = typeof sectionsOrMarkdown === 'string'
        ? deriveDailyTheme(sectionsOrMarkdown, sections, topSignals)
        : '今天 AI 圈最值得复盘的信号';
    const coverInsights = deriveCoverInsights(sections, topSignals);

    // 所有板块分页
    const allPages = [];
    let globalIdx = 1;
    for (const sec of sections) {
        const pages = paginateSection(sec, 3);
        for (const page of pages) {
            allPages.push({ ...page, globalIndex: globalIdx });
        }
        globalIdx++;
    }

    // 小红书最多18张图：封面 + Top5 + 板块页 + 行动卡
    const fixedCardCount = 1 + (topSignals.length ? 1 : 0) + 1;
    if (allPages.length + fixedCardCount > 18) {
        // 合并最后几个板块如果超限
        while (allPages.length + fixedCardCount > 18 && allPages.length > 7) {
            const last = allPages.pop();
            const prev = allPages[allPages.length - 1];
            if (prev.title === last.title) {
                prev.items = prev.items.concat(last.items);
                prev.totalPages = prev.pageNum;
            }
        }
    }

    const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);

    // 导入 puppeteer
    let puppeteer;
    try {
        puppeteer = require(os.homedir() + '/node_modules/puppeteer');
    } catch {
        puppeteer = require('puppeteer');
    }

    const executablePath = resolveChromeExecutable(puppeteer);
    const browser = await puppeteer.launch({
        headless: true,
        executablePath,
        dumpio: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: CARD_WIDTH, height: CARD_HEIGHT, deviceScaleFactor: 2 });

    const paths = [];

    try {
        // 封面
        const coverPath = path.join(outputDir, 'xhs_0_cover.png');
        await page.setContent(coverHtml(date, sections.length, totalItems, theme, coverInsights), { waitUntil: 'load', timeout: 15000 });
        await page.screenshot({ path: coverPath, type: 'png', clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT } });
        paths.push(coverPath);
        console.log(`  ✓ 封面图`);

        if (topSignals.length) {
            const topPath = path.join(outputDir, 'xhs_1_top5.png');
            await page.setContent(topSignalsCardHtml(topSignals, date), { waitUntil: 'load', timeout: 15000 });
            await page.screenshot({ path: topPath, type: 'png', clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT } });
            paths.push(topPath);
            console.log(`  ✓ Top5 排名卡`);
        }

        // 板块卡片
        for (let i = 0; i < allPages.length; i++) {
            const p = allPages[i];
            const safeTitle = p.title.replace(/[\s&]/g, '');
            const suffix = p.totalPages > 1 ? `_p${p.pageNum}` : '';
            const imageIndex = i + 1 + (topSignals.length ? 1 : 0);
            const cardPath = path.join(outputDir, `xhs_${imageIndex}_${safeTitle}${suffix}.png`);
            await page.setContent(sectionCardHtml(p, date, p.globalIndex), { waitUntil: 'load', timeout: 15000 });
            await page.screenshot({ path: cardPath, type: 'png', clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT } });
            paths.push(cardPath);
            console.log(`  ✓ ${p.emoji} ${p.title}${suffix} (${p.items.length}条)`);
        }

        const actionPath = path.join(outputDir, `xhs_${paths.length}_action.png`);
        await page.setContent(actionCardHtml(date, sections, topSignals), { waitUntil: 'load', timeout: 15000 });
        await page.screenshot({ path: actionPath, type: 'png', clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT } });
        paths.push(actionPath);
        console.log(`  ✓ 行动清单卡`);
    } finally {
        await browser.close();
    }

    return paths;
}

function getDefaultSections() {
    return [
        { emoji: '🚀', title: '产品与功能更新', items: [{ subtitle: '详见完整日报', summary: '' }] },
        { emoji: '🔬', title: '前沿研究', items: [{ subtitle: '详见完整日报', summary: '' }] },
        { emoji: '🌍', title: '行业展望与社会影响', items: [{ subtitle: '详见完整日报', summary: '' }] },
        { emoji: '⭐', title: 'Open-source Radar', items: [{ subtitle: '详见完整日报', summary: '' }] },
        { emoji: '💬', title: '社区信号与反共识', items: [{ subtitle: '详见完整日报', summary: '' }] },
        { emoji: '💻', title: 'Harness Engineering', items: [{ subtitle: '详见完整日报', summary: '' }] },
        { emoji: '💡', title: '发现机会', items: [{ subtitle: '详见完整日报', summary: '' }] },
    ];
}

function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cleanCardText(str) {
    return tidyCardText(String(str || '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/show\s+hn:\s*/ig, '')
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/\|/g, '｜')
        .replace(/<\/?[^>]+>/g, '')
        .replace(/^(分析思路与推演链条|分析推演链条|分析思路|推演链条)[：:]\s*/i, '')
        .replace(/^核心判断(?:（证据强度[：:][强中弱]）)?[：:]\s*/i, '')
        .replace(/^(实战建议|反向视角|不确定性)[：:]\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim());
}

function extractCoreSummary(body) {
    const text = String(body || '').trim();
    const strength = '(?:（证据强度[：:][强中弱]）)?';
    const patterns = [
        // **核心判断（证据强度：强）：判断正文**
        new RegExp(`^\\s*\\*\\*核心判断${strength}[：:]\\s*(.+?)\\*\\*`, 's'),
        // **核心判断（证据强度：强）：** 判断正文
        new RegExp(`^\\s*\\*\\*核心判断${strength}[：:]\\*\\*\\s*(.+)`, 's'),
        // **核心判断（证据强度：强）**：判断正文
        new RegExp(`^\\s*\\*\\*核心判断${strength}\\*\\*[：:]\\s*(.+)`, 's'),
        // 核心判断（证据强度：强）：判断正文
        new RegExp(`^\\s*核心判断${strength}[：:]\\s*(.+)`, 's'),
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match) continue;
        const cleaned = cleanCardText(match[1].split('\n\n')[0]);
        if (cleaned && !/^核心判断(?:（证据强度[：:][强中弱]）)?[：:]?$/.test(cleaned)) {
            return cleaned;
        }
    }

    return '';
}

function compactText(text, maxLen) {
    const cleaned = cleanCardText(text);
    if (cleaned.length <= maxLen) return cleaned;
    const cut = cleaned.substring(0, maxLen);
    const lastPunc = Math.max(cut.lastIndexOf('，'), cut.lastIndexOf('、'), cut.lastIndexOf('：'));
    return (lastPunc > 12 ? cut.substring(0, lastPunc) : cut).replace(/[，、：\s]+$/, '') + '…';
}

function tidyCardText(text) {
    return String(text || '')
        .replace(/\s+([，。！？；：])/g, '$1')
        .replace(/([。！？；：])[-–—]+$/g, '$1')
        .replace(/[-–—]+$/g, '')
        .replace(/[，、；：｜/\s]+$/g, '')
        .trim();
}

function similarItem(a, b) {
    const left = normalizeCompareText(a);
    const right = normalizeCompareText(b);
    return left && right && (left.includes(right) || right.includes(left));
}

function normalizeCompareText(text) {
    return String(text || '')
        .replace(/[^\p{Letter}\p{Number}\u4e00-\u9fa5]+/gu, '')
        .toLowerCase()
        .slice(0, 24);
}

function resolveChromeExecutable(puppeteer) {
    const candidates = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }

    return typeof puppeteer.executablePath === 'function' ? puppeteer.executablePath() : undefined;
}

module.exports = {
    generateCoverAndCards,
    parseFullSections,
    paginateSection,
    coverHtml,
    sectionCardHtml,
    topSignalsCardHtml,
    actionCardHtml,
    extractTopSignals,
};
