/**
 * 数据聚合与去重模块
 * 将多个数据源的信号合并、去重、排序
 */

/**
 * 聚合所有信号
 * @param {Array<Signal>} signals - 所有数据源的信号
 * @returns {Array<Signal>} 去重并排序后的信号
 */
export function aggregate(signals) {
    if (!signals || signals.length === 0) {
        return [];
    }

    // 1. 去重（基于 URL）
    const uniqueMap = new Map();
    
    for (const signal of signals) {
        const key = normalizeUrl(signal.url) || signal.id;
        
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, signal);
        } else {
            // 如果已存在，保留分数更高的
            const existing = uniqueMap.get(key);
            if (signal.score > existing.score) {
                uniqueMap.set(key, signal);
            }
        }
    }

    let uniqueSignals = Array.from(uniqueMap.values());

    // 2. 按分数排序（降序）
    uniqueSignals.sort((a, b) => (b.score || 0) - (a.score || 0));

    // 3. 分类（用于后续分析）
    const categorized = {
        news: [],
        project: [],
        paper: [],
        discussion: [],
        trends: [],
    };

    for (const signal of uniqueSignals) {
        const category = signal.category || 'discussion';
        if (categorized[category]) {
            categorized[category].push(signal);
        } else {
            categorized.discussion.push(signal);
        }
    }

    // 4. 从每个类别选择 Top N
    const topSignals = [
        ...categorized.trends.slice(0, 10),      // Trends 全部保留
        ...categorized.news.slice(0, 15),        // 新闻 Top 15
        ...categorized.project.slice(0, 20),     // 项目 Top 20
        ...categorized.paper.slice(0, 10),       // 论文/数据集 Top 10
        ...categorized.discussion.slice(0, 15),  // 讨论 Top 15
    ];

    // 5. 再次去重并排序
    const finalMap = new Map();
    for (const signal of topSignals) {
        const key = normalizeUrl(signal.url) || signal.id;
        if (!finalMap.has(key)) {
            finalMap.set(key, signal);
        }
    }

    return Array.from(finalMap.values())
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 60); // 最终保留 Top 60
}

/**
 * 标准化 URL（用于去重）
 */
function normalizeUrl(url) {
    if (!url) return null;
    
    try {
        const parsed = new URL(url);
        // 移除 UTM 参数和常见追踪参数
        const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'];
        paramsToRemove.forEach(param => parsed.searchParams.delete(param));
        
        // 移除末尾斜杠
        let normalized = parsed.origin + parsed.pathname.replace(/\/+$/, '') + parsed.search;
        return normalized;
    } catch {
        return url;
    }
}

/**
 * 生成跨源主题（用于分析）
 * @param {Array<Signal>} signals
 * @returns {Array<string>}
 */
export function extractCrossThemes(signals) {
    const themeCounts = new Map();
    
    // 提取标题中的关键词
    for (const signal of signals) {
        const words = extractKeywords(signal.title + ' ' + (signal.summary || ''));
        for (const word of words) {
            themeCounts.set(word, (themeCounts.get(word) || 0) + 1);
        }
    }
    
    // 返回出现次数 >= 2 的关键词
    return Array.from(themeCounts.entries())
        .filter(([_, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([word]) => word);
}

/**
 * 提取关键词（简单实现）
 */
function extractKeywords(text) {
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
        'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
        '的', '了', '在', '是', '和', '与', '或', '从', '到', '为', '对',
    ]);

    const words = text
        .toLowerCase()
        .replace(/[^\w\s\u4e00-\u9fff]/g, ' ') // 保留中文、英文、数字
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));
    
    return [...new Set(words)]; // 去重
}
