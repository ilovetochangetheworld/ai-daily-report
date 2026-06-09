/**
 * 小红书卡片图生成模块
 * 使用 HTML 模板 + Puppeteer 截图，替代 Pillow 手画排版
 * 效果：专业级排版，带圆角卡片、渐变、阴影、装饰线条
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 小红书图片标准尺寸 3:4
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1440;

// 系统字号回退链（CI 环境无 Google Fonts）
const FONT_STACK = "'Noto Sans CJK SC','PingFang SC','Microsoft YaHei','WenQuanYi Micro Hei',sans-serif";

/**
 * 生成封面 HTML
 */
function coverHtml(date, stats) {
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
.deco-circle1 {
  position:absolute; top:-120px; right:-80px;
  width:320px; height:320px; border-radius:50%;
  background: radial-gradient(circle, rgba(233,69,96,0.15) 0%, transparent 70%);
}
.deco-circle2 {
  position:absolute; bottom:-60px; left:-100px;
  width:280px; height:280px; border-radius:50%;
  background: radial-gradient(circle, rgba(88,166,255,0.1) 0%, transparent 70%);
}
.top-bar {
  position:absolute; top:0; left:0; right:0; height:6px;
  background: linear-gradient(90deg, #e94560, #ff6b6b, #e94560);
}
.content {
  position:relative; z-index:1;
  padding:80px 72px;
}
.badge {
  display:inline-block;
  background: rgba(233,69,96,0.15);
  border:1px solid rgba(233,69,96,0.3);
  border-radius:20px;
  padding:6px 18px;
  font-size:22px; color:#e94560;
  letter-spacing:2px;
  margin-bottom:24px;
}
.title {
  font-size:88px; font-weight:900;
  letter-spacing:6px;
  background: linear-gradient(135deg, #e94560 0%, #ff6b6b 50%, #e94560 100%);
  -webkit-background-clip:text; -webkit-text-fill-color:transparent;
  background-clip:text;
  line-height:1.15;
  margin-bottom:16px;
}
.date {
  font-size:44px; color:rgba(255,255,255,0.5);
  letter-spacing:4px; font-weight:400;
  margin-bottom:48px;
}
.divider {
  width:100%; height:2px;
  background: linear-gradient(90deg, #e94560, transparent);
  margin-bottom:48px;
}
.sections-grid {
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:14px 40px;
}
.section-item {
  display:flex; align-items:center; gap:12px;
  font-size:30px; color:rgba(255,255,255,0.85);
}
.section-emoji { font-size:32px; }
.footer {
  position:absolute; bottom:60px; left:72px; right:72px;
}
.footer-divider {
  width:100%; height:1px;
  background: linear-gradient(90deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05));
  margin-bottom:20px;
}
.stats { font-size:22px; color:rgba(255,255,255,0.35); margin-bottom:8px; }
.credit { font-size:20px; color:rgba(255,255,255,0.25); }
</style>
</head><body>
<div class="deco-circle1"></div>
<div class="deco-circle2"></div>
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
  <div class="stats">${stats || '数据驱动 · 每日自动化生成'}</div>
  <div class="credit">ilovetochangetheworld.github.io/ai-daily-report</div>
</div>
</body></html>`;
}

/**
 * 生成板块详解卡片 HTML
 */
function sectionCardHtml(section, date, index, total) {
    const items = (section.items || []).slice(0, 4);
    const itemsHtml = items.map(item => `
    <div class="card">
      <div class="card-header">
        <span class="card-bullet"></span>
        <span class="card-subtitle">${escHtml(item.subtitle || '')}</span>
      </div>
      <div class="card-body">${escHtml(item.body || '')}</div>
    </div>`).join('\n');

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
  padding:60px 64px;
}
.section-header { margin-bottom:40px; }
.section-emoji { font-size:52px; margin-bottom:12px; display:block; }
.section-title {
  font-size:48px; font-weight:900;
  color:#e94560;
  letter-spacing:2px;
}
.section-index { font-size:18px; color:rgba(255,255,255,0.25); margin-top:6px; }
.header-line {
  width:80px; height:4px; border-radius:2px;
  background: linear-gradient(90deg, #e94560, #ff6b6b);
  margin-top:16px;
}
.cards { display:flex; flex-direction:column; gap:20px; }
.card {
  background: rgba(255,255,255,0.04);
  border:1px solid rgba(255,255,255,0.06);
  border-radius:16px;
  padding:28px 30px;
}
.card-header {
  display:flex; align-items:center; gap:12px;
  margin-bottom:12px;
}
.card-bullet {
  width:8px; height:8px; border-radius:50%;
  background:#58a6ff; flex-shrink:0;
}
.card-subtitle { font-size:28px; font-weight:700; color:#58a6ff; }
.card-body {
  font-size:24px; line-height:1.7;
  color:rgba(255,255,255,0.7);
  padding-left:20px;
}
.footer {
  position:absolute; bottom:40px; left:64px; right:64px;
  display:flex; justify-content:space-between; align-items:center;
}
.footer-left { font-size:20px; color:rgba(255,255,255,0.25); }
.footer-right { font-size:16px; color:rgba(255,255,255,0.15); }
.page-indicator {
  position:absolute; bottom:72px; right:64px;
  display:flex; gap:6px;
}
.page-dot {
  width:8px; height:8px; border-radius:50%;
  background:rgba(255,255,255,0.15);
}
.page-dot.active { background:#e94560; }
</style>
</head><body>
<div class="deco-circle"></div>
<div class="top-bar"></div>
<div class="content">
  <div class="section-header">
    <span class="section-emoji">${section.emoji || '📌'}</span>
    <div class="section-title">${escHtml(section.title || '')}</div>
    <div class="section-index">SECTION ${index + 1} / ${total}</div>
    <div class="header-line"></div>
  </div>
  <div class="cards">
    ${itemsHtml}
  </div>
</div>
<div class="footer">
  <span class="footer-left">AI日报 · ${date}</span>
</div>
<div class="page-indicator">
  ${Array.from({length: total}, (_, i) => `<div class="page-dot ${i === index ? 'active' : ''}"></div>`).join('')}
</div>
</body></html>`;
}

/**
 * 生成所有卡片图（封面 + 板块详解）
 */
async function generateCoverAndCards(date, sections, outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });

    // 动态导入 puppeteer
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
        // 1. 封面
        const coverPath = path.join(outputDir, 'xhs_0_cover.png');
        await page.setContent(coverHtml(date), { waitUntil: 'load', timeout: 15000 });
        await page.screenshot({ path: coverPath, type: 'png', clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT } });
        paths.push(coverPath);
        console.log(`  ✓ 封面图: ${path.basename(coverPath)}`);

        // 2. 各板块卡片
        const safeSections = sections.length > 0 ? sections : getDefaultSections();
        for (let i = 0; i < safeSections.length; i++) {
            const cardPath = path.join(outputDir, `xhs_${i + 1}_${safeSections[i].title.replace(/[\s&]/g, '')}.png`);
            await page.setContent(sectionCardHtml(safeSections[i], date, i, safeSections.length), { waitUntil: 'load', timeout: 15000 });
            await page.screenshot({ path: cardPath, type: 'png', clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT } });
            paths.push(cardPath);
            console.log(`  ✓ 板块图: ${path.basename(cardPath)}`);
        }
    } finally {
        await browser.close();
    }

    return paths;
}

/**
 * 默认7板块（当解析内容失败时使用）
 */
function getDefaultSections() {
    return [
        { emoji: '🚀', title: '产品与功能更新', items: [{ subtitle: '详见完整日报', body: '' }] },
        { emoji: '🔬', title: '前沿研究', items: [{ subtitle: '详见完整日报', body: '' }] },
        { emoji: '🌍', title: '行业展望与社会影响', items: [{ subtitle: '详见完整日报', body: '' }] },
        { emoji: '⭐', title: '开源TOP项目', items: [{ subtitle: '详见完整日报', body: '' }] },
        { emoji: '💬', title: '社媒热议', items: [{ subtitle: '详见完整日报', body: '' }] },
        { emoji: '💻', title: 'AICoding&工程', items: [{ subtitle: '详见完整日报', body: '' }] },
        { emoji: '💡', title: '发现机会', items: [{ subtitle: '详见完整日报', body: '' }] },
    ];
}

/**
 * HTML 转义
 */
function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { generateCoverAndCards, coverHtml, sectionCardHtml };
