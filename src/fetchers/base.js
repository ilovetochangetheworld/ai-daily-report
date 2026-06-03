/**
 * 数据源统一格式定义
 * @typedef {Object} Signal
 * @property {string} id - 唯一标识
 * @property {string} title - 标题
 * @property {string} url - 链接
 * @property {string} source - 来源 (hackernews|github|producthunt|reddit|huggingface|v2ex|trends)
 * @property {string} category - 分类 (news|project|paper|discussion)
 * @property {string} published_date - 发布日期 (ISO 8601)
 * @property {number} score - 热度分数
 * @property {string} [summary] - 摘要（可选）
 * @property {Object} [metadata] - 额外元数据（可选）
 */

/**
 * 基础抓取器类
 */
export class BaseFetcher {
    constructor(name) {
        this.name = name;
    }

    /**
     * 抓取数据 - 子类必须实现
     * @returns {Promise<Signal[]>}
     */
    async fetch() {
        throw new Error('fetch() 方法必须由子类实现');
    }

    /**
     * 安全抓取 - 带错误处理的包装
     * @param {import('axios').AxiosInstance} client
     * @returns {Promise<Signal[]>}
     */
    async safeFetch(client) {
        try {
            console.log(`  → 正在抓取 ${this.name}...`);
            const signals = await this.fetch(client);
            console.log(`  ✓ ${this.name}: ${signals.length} 条信号`);
            return signals;
        } catch (error) {
            console.error(`  ✗ ${this.name} 抓取失败: ${error.message}`);
            return [];
        }
    }
}
