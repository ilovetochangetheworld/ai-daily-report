/**
 * 基础抓取器类
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
}

module.exports = { BaseFetcher };
