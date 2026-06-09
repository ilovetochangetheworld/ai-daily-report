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
        '社媒热议': '💬',
        '社媒分享': '💬',
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
            '开源 TOP': '开源 TOP 项目',
            '开源TOP': '开源 TOP 项目',
            '安卓化': '开源 TOP 项目',
            '社媒': '社媒热议',
            'Coding': 'AI Coding & 工程',
            'harness': 'AI Coding & 工程',
            '发现机会': '发现机会',
        };
        let normalizedTitle = '';
        for (const [key, val] of Object.entries(belongMap)) {
            if (sectionTitle.includes(key)) { normalizedTitle = val; break; }
        }
        // 如果自身已是标准板块名就不变
        const standardNames = ['产品与功能更新', '前沿研究', '行业展望与社会影响', '开源 TOP 项目', '社媒热议', 'AI Coding & 工程', '发现机会'];
        if (standardNames.includes(sectionTitle)) {
            normalizedTitle = sectionTitle;
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

        // 提取 ### 子条目
        const subs = sec.split(/(?=^### )/m).filter(s => s.startsWith('### '));
        const items = [];
        for (const sub of subs) {
            const subMatch = sub.match(/^### (.+)/);
            if (!subMatch) continue;
            let subTitle = subMatch[1].replace(/^\d+\.\s*/, '').trim();

            // 提取核心判断段落作为摘要
            const body = sub.replace(/^### .*/m, '').trim();
            let summary = '';

            // 提取 "核心判断" 行（三种格式）
            // 1. **核心判断：xxx** （整体在一对星号内）
            // 2. **核心判断：**xxx** （冒号在第一对星号外结尾）
            // 3. **核心判断**：xxx （冒号在星号外）
            const coreLine = body.match(/\*\*核心判断[：:]\s*(.+?)\*\*/s) ||
                             body.match(/\*\*核心判断[：:]\*\*\s*(.+?)\*\*/s) ||
                             body.match(/\*\*核心判断\*\*[：:]\s*(.+)/);
            if (coreLine) {
                summary = coreLine[1].replace(/\*\*/g, '').trim();
            }

            // 如果没找到核心判断，取第一段非空文本
            if (!summary) {
                const firstPara = body.split('\n\n').find(p => p.trim() && !p.trim().startsWith('-') && !p.trim().startsWith('>') && !p.trim().startsWith('**'));
                if (firstPara) {
                    summary = firstPara.replace(/\*\*/g, '').replace(/[\-\*]\s*/g, '').trim();
                }
            }

            // 补充第一条关键证据（仅当核心判断未提取到时，或 summary 极短）
            if (summary && coreLine) {
                // 核心判断已成功提取，不再追加证据列表
            } else if (summary.length < 40) {
                const evidences = body.match(/^-\s+(.+)/gm) || [];
                for (const ev of evidences) {
                    const evText = ev.replace(/^-\s+/, '').replace(/\[.*?\]\(.*?\)/g, '').replace(/\*\*/g, '').trim();
                    if (evText.length > 15 && !summary.includes(evText.substring(0, 15))) {
                        summary = summary ? summary + '；' + evText : evText;
                        break;
                    }
                }
            }

            // 截断到 150 字
            if (summary.length > 150) {
                summary = summary.substring(0, 147) + '...';
            }

            // 如果还是没有，从关键证据里取第一条
            if (!summary) {
                const evidence = body.match(/-\s*(.+)/);
                if (evidence) {
                    summary = evidence[1].replace(/\[.*?\]\(.*?\)/g, '').replace(/\*\*/g, '').trim();
                    if (summary.length > 120) summary = summary.substring(0, 117) + '...';
                }
            }

            if (subTitle && summary) {
                existing.items.push({ subtitle: subTitle, summary });
            }
        }

        // 也收集关键证据作为额外条目（如果 ### 条目少于2个）
        if (existing.items.length < 2) {
            const evidenceLines = sec.match(/^-\s+(.+)/gm) || [];
            for (const el of evidenceLines) {
                const text = el.replace(/^-\s+/, '').replace(/\[.*?\]\(.*?\)/g, '').replace(/\*\*/g, '').trim();
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

/**
 * 生成封面 HTML
 */
function coverHtml(date, sectionCount, totalItems) {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  width:${CARD_WIDTH}px; height:${CARD_HEIGHT}px;
  font-family:${FONT_STACK};
  overflow:hidden;
  background: linear-gradient(165deg, #0f0c29 0%, #1a1a2e 40%, #16213e 100%);
  color:#fff;
  position:relative;
}
.deco1 { position:absolute; top:-120px; right:-80px; width:320px; height:320px; border-radius:50%; background:radial-gradient(circle,rgba(233,69,96,.15) 0%,transparent 70%); }
.deco2 { position:absolute; bottom:-60px; left:-100px; width:280px; height:280px; border-radius:50%; background:radial-gradient(circle,rgba(88,166,255,.1) 0%,transparent 70%); }
.top-bar { position:absolute; top:0; left:0; right:0; height:6px; background:linear-gradient(90deg,#e94560,#ff6b6b,#e94560); }
.content { position:relative; z-index:1; padding:80px 72px; }
.badge { display:inline-block; background:rgba(233,69,96,.15); border:1px solid rgba(233,69,96,.3); border-radius:20px; padding:6px 18px; font-size:22px; color:#e94560; letter-spacing:2px; margin-bottom:24px; }
.title { font-size:88px; font-weight:900; letter-spacing:6px; background:linear-gradient(135deg,#e94560 0%,#ff6b6b 50%,#e94560 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; line-height:1.15; margin-bottom:16px; }
.date { font-size:44px; color:rgba(255,255,255,.5); letter-spacing:4px; font-weight:400; margin-bottom:48px; }
.divider { width:100%; height:2px; background:linear-gradient(90deg,#e94560,transparent); margin-bottom:48px; }
.sections-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px 40px; }
.section-item { display:flex; align-items:center; gap:12px; font-size:30px; color:rgba(255,255,255,.85); }
.section-emoji { font-size:32px; }
.footer { position:absolute; bottom:60px; left:72px; right:72px; }
.footer-divider { width:100%; height:1px; background:linear-gradient(90deg,rgba(255,255,255,.1),rgba(255,255,255,.05)); margin-bottom:20px; }
.stats { font-size:22px; color:rgba(255,255,255,.35); margin-bottom:8px; }
.credit { font-size:20px; color:rgba(255,255,255,.25); }
</style>
</head><body>
<div class="deco1"></div>
<div class="deco2"></div>
<div class="top-bar"></div>
<div class="content">
  <div class="badge">DAILY REPORT</div>
  <div class="title">AI 日报</div>
  <div class="date">${date}</div>
  <div class="divider"></div>
  <div class="sections-grid">
    <div class="section-item"><span class="section-emoji">🚀</span> 产品与功能更新</div>
    <div class="section-item"><span class="section-emoji">🔬</span> 前沿研究</div>
    <div class="section-item"><span class="section-emoji">🌍</span> 行业展望与社会影响</div>
    <div class="section-item"><span class="section-emoji">⭐</span> 开源 TOP 项目</div>
    <div class="section-item"><span class="section-emoji">💬</span> 社媒热议</div>
    <div class="section-item"><span class="section-emoji">💻</span> AI Coding & 工程</div>
    <div class="section-item"><span class="section-emoji">💡</span> 发现机会</div>
  </div>
</div>
<div class="footer">
  <div class="footer-divider"></div>
  <div class="stats">${totalItems} 条精华 · ${sectionCount} 维度深度分析</div>
  <div class="credit">ilovetochangetheworld.github.io/ai-daily-report</div>
</div>
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
      <div class="card-body">${escHtml(item.summary)}</div>
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
  background: linear-gradient(165deg, #0f0c29 0%, #1a1a2e 40%, #16213e 100%);
  color:#fff;
  position:relative;
}
.deco-circle {
  position:absolute; top:-100px; right:-120px;
  width:300px; height:300px; border-radius:50%;
  background: radial-gradient(circle, rgba(233,69,96,0.08) 0%, transparent 70%);
}
.top-bar {
  position:absolute; top:0; left:0; right:0; height:6px;
  background: linear-gradient(90deg, #e94560, #ff6b6b, #e94560);
}
.content {
  position:relative; z-index:1;
  padding:56px 60px;
}
.section-header { margin-bottom:32px; }
.section-emoji { font-size:48px; margin-bottom:10px; display:block; }
.section-title {
  font-size:44px; font-weight:900;
  color:#e94560;
  letter-spacing:2px;
}
.section-meta {
  font-size:16px; color:rgba(255,255,255,.2);
  margin-top:6px;
}
.header-line {
  width:80px; height:4px; border-radius:2px;
  background: linear-gradient(90deg, #e94560, #ff6b6b);
  margin-top:14px;
}
.cards { display:flex; flex-direction:column; gap:16px; }
.card {
  background: rgba(255,255,255,0.04);
  border:1px solid rgba(255,255,255,0.06);
  border-radius:14px;
  padding:22px 26px;
}
.card-header {
  display:flex; align-items:center; gap:10px;
  margin-bottom:10px;
}
.card-bullet {
  width:7px; height:7px; border-radius:50%;
  background:#58a6ff; flex-shrink:0;
}
.card-subtitle { font-size:24px; font-weight:700; color:#58a6ff; }
.card-body {
  font-size:21px; line-height:1.65;
  color:rgba(255,255,255,.65);
  padding-left:17px;
}
.footer {
  position:absolute; bottom:36px; left:60px; right:60px;
  display:flex; justify-content:space-between; align-items:center;
}
.footer-left { font-size:18px; color:rgba(255,255,255,.22); }
.footer-right { font-size:15px; color:rgba(255,255,255,.13); }
</style>
</head><body>
<div class="deco-circle"></div>
<div class="top-bar"></div>
<div class="content">
  <div class="section-header">
    <span class="section-emoji">${page.emoji || '📌'}</span>
    <div class="section-title">${escHtml(page.title)}${pageLabel}</div>
    <div class="section-meta">SECTION ${globalIndex}</div>
    <div class="header-line"></div>
  </div>
  <div class="cards">
    ${itemsHtml}
  </div>
</div>
<div class="footer">
  <span class="footer-left">AI日报 · ${date}</span>
  <span class="footer-right">ilovetochangetheworld.github.io/ai-daily-report</span>
</div>
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

    // 小红书最多18张图
    if (allPages.length + 1 > 18) {
        // 合并最后几个板块如果超限
        while (allPages.length + 1 > 18 && allPages.length > 7) {
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

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: CARD_WIDTH, height: CARD_HEIGHT, deviceScaleFactor: 2 });

    const paths = [];

    try {
        // 封面
        const coverPath = path.join(outputDir, 'xhs_0_cover.png');
        await page.setContent(coverHtml(date, sections.length, totalItems), { waitUntil: 'load', timeout: 15000 });
        await page.screenshot({ path: coverPath, type: 'png', clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT } });
        paths.push(coverPath);
        console.log(`  ✓ 封面图`);

        // 板块卡片
        for (let i = 0; i < allPages.length; i++) {
            const p = allPages[i];
            const safeTitle = p.title.replace(/[\s&]/g, '');
            const suffix = p.totalPages > 1 ? `_p${p.pageNum}` : '';
            const cardPath = path.join(outputDir, `xhs_${i + 1}_${safeTitle}${suffix}.png`);
            await page.setContent(sectionCardHtml(p, date, p.globalIndex), { waitUntil: 'load', timeout: 15000 });
            await page.screenshot({ path: cardPath, type: 'png', clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT } });
            paths.push(cardPath);
            console.log(`  ✓ ${p.emoji} ${p.title}${suffix} (${p.items.length}条)`);
        }
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
        { emoji: '⭐', title: '开源TOP项目', items: [{ subtitle: '详见完整日报', summary: '' }] },
        { emoji: '💬', title: '社媒热议', items: [{ subtitle: '详见完整日报', summary: '' }] },
        { emoji: '💻', title: 'AICoding&工程', items: [{ subtitle: '详见完整日报', summary: '' }] },
        { emoji: '💡', title: '发现机会', items: [{ subtitle: '详见完整日报', summary: '' }] },
    ];
}

function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { generateCoverAndCards, parseFullSections, paginateSection, coverHtml, sectionCardHtml };
