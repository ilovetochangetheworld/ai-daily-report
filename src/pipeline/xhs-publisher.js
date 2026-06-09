/**
 * 小红书发布模块
 * - 从完整日报中提取精华，生成适合小红书的专业分析版
 * - 自动生成封面图
 * - 通过 xhs-cli 发布
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { callLLM } = require('./llm');
const { generateCoverAndCards } = require('./xhs-cards');

/**
 * 从完整日报 Markdown 提取小红书版本
 * 使用 LLM 做专业化的内容提炼，遵循 humanizer 原则去 AI 味
 */
async function generateXhsContent(fullMarkdown, date) {
    const systemPrompt = `你是资深科技分析师，负责把一份 AI 日报精炼成小红书版帖子。

排版规范（必须严格遵守）：

【标题】选当天最有冲击力的 1-2 条做标题，格式：「⚡️关键词短句｜AI日报M.D」，吸引人但不是标题党

【正文结构】
- 开头直接放标题（和笔记标题一致）
- 空一行后放分隔线：━━━━━━━━━━━━━━━━
- 每条新闻格式：
  emoji 【方括号小标题】
  空一行
  正文内容（2-4句，带观点）
  空一行
- 不同板块之间必须多空一行（即板块间距=两个空行），让读者清楚分隔
- 每条用专属 emoji 区分类别：🧠研究/模型 🚀产品/发布 💰融资/商业 🤖Agent/工具 📊评估/数据 🧑‍💻招聘/人才 🔧开源/工程 💡机会/发现
- 正文结束后放分隔线：━━━━━━━━━━━━━━━━
- 底部固定放两行：
  🔗 完整日报：ilovetochangetheworld.github.io/ai-daily-report
  📊 今日数据：X条信号 → Y条精选 → Z维度深度分析
- 最后换行放话题标签

内容要求：
1. 专业性优先——有立场的分析，不是中性信息搬运
2. 语气像跟懂行的朋友聊天，不是写公关稿
3. 去掉所有 AI 味：不要「核心判断」「反向视角」「实战建议」这类模板标签，不要过度加粗，不要规则三排列
4. 选最有讨论价值的 5-6 条，每条说到位
5. 总字数控制在 600-800 字

输出纯文本，不要 Markdown 标题语法（#），用 emoji + 【】方括号做小标题。`;

    const userPrompt = `以下是 ${date} 的 AI 日报完整内容，请生成小红书版：

${fullMarkdown}`;

    try {
        const content = await callLLM(systemPrompt, userPrompt, { maxTokens: 4000 });
        return content.trim();
    } catch (error) {
        console.error('  ⚠ LLM生成小红书版失败，使用降级方案:', error.message);
        return generateXhsContentFallback(fullMarkdown, date);
    }
}

/**
 * 降级方案：从完整日报手动提取精华段落
 */
function generateXhsContentFallback(fullMarkdown, date) {
    // 提取每个 ## 段落的第一个 ### 子标题和第一段
    const sections = fullMarkdown.split(/(?=^## )/m);
    const picks = [];

    for (const section of sections) {
        const titleMatch = section.match(/^## .+\n\n### (\d+\.?\s*.+)/m);
        const bodyMatch = section.match(/^### .+\n\n\*\*(.+?)\*\*/m);
        if (titleMatch && bodyMatch) {
            picks.push(`${picks.length + 1}｜${titleMatch[1]}\n${bodyMatch[1]}`);
        }
        if (picks.length >= 6) break;
    }

    const lines = fullMarkdown.split('\n');
    const sources = (lines[lines.length - 1] || '').replace(/^\*数据来源：/, '').replace(/\*$/, '');

    let content = `⚡️${picks[0]?.replace(/\|/g, '｜') || 'AI日报'}｜AI日报${date.substring(5).replace('-', '.')}\n\n`;
    content += `━━━━━━━━━━━━━━━━\n\n`;
    for (const pick of picks) {
        content += `${pick}\n\n`;
    }
    content += `━━━━━━━━━━━━━━━━\n\n`;
    content += `🔗 完整日报：ilovetochangetheworld.github.io/ai-daily-report\n`;
    content += `📊 今日数据：${sources}\n\n`;
    content += '#AI日报 #大模型 #AI行业趋势 #开源AI #AIAgent';

    return content;
}

/**
 * 发布到小红书
 */
async function publishToXhs({ date, fullMarkdown, signals }) {
    console.log('\n📕 小红书发布流程...');

    // 1. 生成小红书版内容
    console.log('  → 生成小红书版内容...');
    const xhsContent = await generateXhsContent(fullMarkdown, date);
    console.log(`  ✓ 内容生成完成 (${xhsContent.length} 字)`);

    // 2. 从 LLM 生成的内容解析 sections（用于图片生成）；如果解析失败则从完整日报解析
    let sections = parseSectionsFromContent(xhsContent);
    if (sections.length < 3) {
        console.log('  → 小红书内容板块不足，从完整日报解析...');
        const { parseFullSections } = require('./xhs-cards');
        sections = parseFullSections(fullMarkdown);
    }

    // 3. 生成封面 + 板块详解图 (HTML+Puppeteer)，传入完整日报作为图片内容来源
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

    // 4. 发布
    const title = extractTitle(xhsContent);
    console.log(`  → 发布到小红书: ${title}`);

    try {
        // 构建 xhs post 命令，多张图用多个 --images
        const imgArgs = imagePaths.map(p => `--images ${JSON.stringify(p)}`).join(' ');
        const topic = sections[0]?.title || 'AI日报';
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
 * 从小红书内容中解析板块结构（用于图片生成）
 */
function parseSectionsFromContent(xhsContent) {
    const sectionMap = {
        '🚀': { emoji: '🚀', title: '产品与功能更新', items: [] },
        '🔬': { emoji: '🔬', title: '前沿研究', items: [] },
        '🌍': { emoji: '🌍', title: '行业展望与社会影响', items: [] },
        '⭐': { emoji: '⭐', title: '开源 TOP 项目', items: [] },
        '💬': { emoji: '💬', title: '社媒热议', items: [] },
        '💻': { emoji: '💻', title: 'AI Coding & 工程', items: [] },
        '💡': { emoji: '💡', title: '发现机会', items: [] },
    };

    const lines = xhsContent.split('\n');
    let currentSection = null;

    for (const line of lines) {
        const trimmed = line.trim();
        // Match section header like: 🚀 【产品更新】
        const headerMatch = trimmed.match(/^([\u{1F300}-\u{1F9FF}])\s*【(.+?)】/u);
        if (headerMatch) {
            const emoji = headerMatch[1];
            currentSection = sectionMap[emoji] || null;
            continue;
        }

        // Match item subtitle like: ▶ 4B端侧认知模型
        const subMatch = trimmed.match(/^▶\s*(.+)/);
        if (subMatch && currentSection) {
            currentSection.items.push({ subtitle: subMatch[1], body: '' });
            continue;
        }

        // Body text for current item
        if (currentSection && currentSection.items.length > 0 && trimmed && !trimmed.startsWith('━') && !trimmed.startsWith('🔗') && !trimmed.startsWith('📊') && !trimmed.startsWith('#')) {
            const lastItem = currentSection.items[currentSection.items.length - 1];
            lastItem.body = lastItem.body ? `${lastItem.body} ${trimmed}` : trimmed;
        }
    }

    return Object.values(sectionMap).filter(s => s.items.length > 0);
}

/**
 * 从内容中提取标题（第一行）
 */
function extractTitle(content) {
    const firstLine = content.split('\n')[0]?.trim() || 'AI日报';
    return firstLine.substring(0, 20);
}

module.exports = { publishToXhs, generateXhsContent, parseSectionsFromContent };
