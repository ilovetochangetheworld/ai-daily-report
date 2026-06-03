/**
 * 数据聚合与去重模块
 */

function aggregate(signals) {
    if (!signals || signals.length === 0) {
        return [];
    }

    const uniqueMap = new Map();
    
    for (const signal of signals) {
        const key = normalizeUrl(signal.url) || signal.id;
        
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, signal);
        } else {
            const existing = uniqueMap.get(key);
            if (signal.score > existing.score) {
                uniqueMap.set(key, signal);
            }
        }
    }

    let uniqueSignals = Array.from(uniqueMap.values());
    uniqueSignals.sort((a, b) => (b.score || 0) - (a.score || 0));

    const categorized = { news: [], project: [], paper: [], discussion: [], trends: [] };
    for (const signal of uniqueSignals) {
        const category = signal.category || 'discussion';
        if (categorized[category]) {
            categorized[category].push(signal);
        } else {
            categorized.discussion.push(signal);
        }
    }

    const topSignals = [
        ...categorized.trends.slice(0, 10),
        ...categorized.news.slice(0, 15),
        ...categorized.project.slice(0, 20),
        ...categorized.paper.slice(0, 10),
        ...categorized.discussion.slice(0, 15),
    ];

    const finalMap = new Map();
    for (const signal of topSignals) {
        const key = normalizeUrl(signal.url) || signal.id;
        if (!finalMap.has(key)) {
            finalMap.set(key, signal);
        }
    }

    return Array.from(finalMap.values())
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 60);
}

function normalizeUrl(url) {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'];
        paramsToRemove.forEach(param => parsed.searchParams.delete(param));
        let normalized = parsed.origin + parsed.pathname.replace(/\/+$/, '') + parsed.search;
        return normalized;
    } catch {
        return url;
    }
}

function extractCrossThemes(signals) {
    const themeCounts = new Map();
    for (const signal of signals) {
        const words = extractKeywords(signal.title + ' ' + (signal.summary || ''));
        for (const word of words) {
            themeCounts.set(word, (themeCounts.get(word) || 0) + 1);
        }
    }
    return Array.from(themeCounts.entries())
        .filter(([_, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([word]) => word);
}

function extractKeywords(text) {
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
        'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
    ]);
    const words = text
        .toLowerCase()
        .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));
    return [...new Set(words)];
}

module.exports = { aggregate, extractCrossThemes };
