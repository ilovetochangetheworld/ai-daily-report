/**
 * 基础抓取器类
 * 
 * 信号对象格式：
 * {
 *   id, title, url, source, category, published_date, score, summary, metadata,
 *   image_url,  // 可选 - 封面图/缩略图 URL
 *   video_url,  // 可选 - 视频 URL
 * }
 */

class BaseFetcher {
    constructor(name) {
        this.name = name;
    }

    async fetch() {
        throw new Error('fetch() 方法必须由子类实现');
    }

    async safeFetch() {
        try {
            console.log(`  → 正在抓取 ${this.name}...`);
            const signals = await this.fetch();
            console.log(`  ✓ ${this.name}: ${signals.length} 条信号`);
            return signals;
        } catch (error) {
            console.error(`  ✗ ${this.name} 抓取失败: ${error.message}`);
            return [];
        }
    }

    /**
     * 安全提取图片 URL，确保返回有效字符串或 null
     */
    _extractImageUrl(value) {
        if (!value) return null;
        if (typeof value === 'string') {
            return value.startsWith('http') ? value : null;
        }
        if (typeof value === 'object' && value.url) {
            return value.url.startsWith('http') ? value.url : null;
        }
        if (Array.isArray(value) && value.length > 0) {
            const first = value[0];
            if (typeof first === 'string' && first.startsWith('http')) return first;
            if (typeof first === 'object' && first.url && first.url.startsWith('http')) return first.url;
        }
        return null;
    }

    /**
     * 安全提取视频 URL，确保返回有效字符串或 null
     */
    _extractVideoUrl(value) {
        if (!value) return null;
        if (typeof value === 'string') {
            return value.startsWith('http') ? value : null;
        }
        if (typeof value === 'object' && value.url) {
            return value.url.startsWith('http') ? value.url : null;
        }
        const variants = value.variants || value.video_info?.variants || [];
        const mp4 = variants.filter(v => v.content_type === 'video/mp4' || (v.url && v.url.endsWith('.mp4')));
        if (mp4.length > 0) {
            // 选择最高码率
            mp4.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
            return mp4[0].url;
        }
        if (typeof value.url === 'string' && value.url.startsWith('http')) return value.url;
        return null;
    }
}

module.exports = { BaseFetcher };
