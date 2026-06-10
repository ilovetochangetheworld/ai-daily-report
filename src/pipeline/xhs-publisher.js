/**
 * 小红书发布模块
 * - 从完整日报解析7板块全部条目，模板组装小红书正文
 * - 自动生成封面图+板块详解图
 * - 通过 xhs-cli 发布
 */

const { execSync } = require('child_process');
const path = require('path');
const { generateCoverAndCards, parseFullSections } = require('./xhs-cards');

// 板块 emoji 对照表
const SECTION_EMOJIS = {
    '产品与功能更新': '🚀',
    '前沿研究': '🔬',
    '行业展望与社会影响': '🌍',
    '开源 TOP 项目': '⭐',
    '社媒热议': '💬',
    'AI Coding & 工程': '💻',
    'AI Coding & harness 工程': '💻',
    '发现机会': '💡',
};

/**
 * 从完整日报生成小红书正文
 * 策略：解析7板块所有条目，提取核心摘要，用模板组装
 * 无需 LLM，稳定可控，内容完整覆盖
 */
function generateXhsContent(fullMarkdown, date) {
    const sections = parseFullSections(fullMarkdown);

    // 找当天最有冲击力的条目做标题——优先取完整短语（到冒号后截断）
    let headline = '';
    for (const sec of sections) {
        for (const item of sec.items) {
            if (item.subtitle.length > 8 && !headline) {
                const quoted = item.subtitle.match(/“([^”]{4,12})”/);
                if (quoted) {
                    headline = quoted[1];
                    break;
                }
                // 如果有冒号，取冒号前的短标题
                const colonIdx = item.subtitle.indexOf('：');
                if (colonIdx > 2 && colonIdx < 14) {
                    headline = item.subtitle.substring(0, colonIdx);
                } else {
                    headline = item.subtitle.substring(0, 14);
                }
                break;
            }
        }
        if (headline) break;
    }
    const dateStr = date.substring(5).replace('-', '.');
    const title = headline
        ? `⚡️${headline.substring(0, 14)}｜AI日报${dateStr}`
        : `⚡️AI日报${dateStr}`;

    let content = title + '\n\n';
    content += '今天的 AI 信号我整理成卡片了，适合先看图速览，再回到正文抓重点。\n\n';
    content += '━━━━━━━━━━━━━━━━\n\n';
    content += '🔥 今日最值得关注\n\n';

    const highlights = [];
    for (const sec of sections) {
        const emoji = SECTION_EMOJIS[sec.title] || sec.emoji || '📌';
        for (const item of sec.items.slice(0, 2)) {
            highlights.push({ emoji, item });
            if (highlights.length >= 8) break;
        }
        if (highlights.length >= 8) break;
    }

    for (const { emoji, item } of highlights) {
        content += `${emoji} ${compactTitle(item.subtitle, 24)}\n${compactBrief(item.summary, 54)}\n\n`;
    }

    content += '━━━━━━━━━━━━━━━━\n\n';
    content += '📌 卡片覆盖完整板块：产品、研究、行业、开源、社媒、Coding、机会。\n';
    content += '🔗 完整日报：ilovetochangetheworld.github.io/ai-daily-report\n';

    // 统计数据
    const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
    content += `📊 今日数据：${totalItems} 条精华 · ${sections.length} 个维度\n\n`;
    content += '#AI日报 #大模型 #AIAgent #AI工具 #科技趋势 #AI创业';

    return content;
}

/**
 * 发布到小红书
 */
async function publishToXhs({ date, fullMarkdown, signals }) {
    console.log('\n📕 小红书发布流程...');

    // 1. 生成小红书版内容（模板组装，完整7板块）
    console.log('  → 生成小红书版内容...');
    const xhsContent = generateXhsContent(fullMarkdown, date);
    console.log(`  ✓ 内容生成完成 (${xhsContent.length} 字)`);

    // 2. 生成封面 + 板块详解图 (HTML+Puppeteer)
    const coverDir = path.join(path.resolve(__dirname, '../..'), 'xhs_covers');
    console.log('  → 生成封面+板块详解图 (HTML+Puppeteer)...');
    let imagePaths = null;
    try {
        imagePaths = await generateCoverAndCards(date, fullMarkdown, coverDir);
    } catch (e) {
        console.log('  ⚠ HTML截图生成失败:', e.message?.substring(0, 200));
    }

    if (!imagePaths || imagePaths.length < 1) {
        console.log('  ⚠ 图片生成失败，跳过小红书发布');
        return null;
    }
    console.log(`  ✓ ${imagePaths.length} 张图就绪`);

    // 3. 发布
    const title = extractTitle(xhsContent);
    console.log(`  → 发布到小红书: ${title}`);

    try {
        const imgArgs = imagePaths.map(p => `--images ${JSON.stringify(p)}`).join(' ');
        const parsedSections = parseFullSections(fullMarkdown);
        const topic = parsedSections[0]?.title || 'AI日报';
        const result = execSync(
            `xhs post --title ${JSON.stringify(title)} --body ${JSON.stringify(xhsContent)} ${imgArgs} --topic ${JSON.stringify(topic)} --json`,
            { encoding: 'utf8', timeout: 120000 }
        );

        const parsed = JSON.parse(result);
        if (parsed.ok) {
            console.log(`  ✓ 小红书发布成功！笔记ID: ${parsed.data?.id}`);
            return parsed.data;
        } else {
            console.log(`  ✗ 小红书发布失败:`, JSON.stringify(parsed));
            return null;
        }
    } catch (error) {
        console.error('  ✗ 小红书发布异常:', error.message?.substring(0, 200));
        return null;
    }
}

/**
 * 从内容中提取标题（第一行）
 */
function extractTitle(content) {
    const firstLine = content.split('\n')[0]?.trim() || 'AI日报';
    return firstLine.substring(0, 20);
}

function compactTitle(title, maxLen) {
    const cleaned = String(title || '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned.length > maxLen ? cleaned.substring(0, maxLen - 1) + '…' : cleaned;
}

function compactBrief(summary, maxLen) {
    let brief = String(summary || '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[（(]\s*[）)]/g, '')
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/^(分析思路与推演链条|分析推演链条|分析思路|推演链条)[：:]\s*/i, '')
        .replace(/^关键证据[：:]\s*/i, '')
        .replace(/^核心判断[：:]\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (brief.includes('；')) {
        brief = brief.split('；')[0];
    }
    if (brief.includes('。') && brief.indexOf('。') < brief.length - 1) {
        const firstSentence = brief.substring(0, brief.indexOf('。') + 1);
        if (firstSentence.length > 15) brief = firstSentence;
    }
    if (brief.length > maxLen) {
        const cut = brief.substring(0, maxLen);
        const lastPunc = Math.max(cut.lastIndexOf('，'), cut.lastIndexOf('、'));
        brief = lastPunc > 12 ? brief.substring(0, lastPunc) + '…' : cut + '…';
    }
    return brief.replace(/[，；、\s]+$/, '');
}

module.exports = { publishToXhs, generateXhsContent };
