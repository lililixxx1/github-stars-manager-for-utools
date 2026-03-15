/**
 * 性能基准测试工具
 * @module utils/benchmark
 * @since v1.7.0
 *
 * 用于测量和比较代码优化前后的性能差异
 */

export interface BenchmarkResult {
    avg: number;
    min: number;
    max: number;
    p95: number;
}

export interface ComparisonResult {
    oldResult: BenchmarkResult;
    newResult: BenchmarkResult;
    improvement: string;
}

export class Benchmark {
    private static results: Map<string, BenchmarkResult> = new Map();

    /**
     * 测量函数执行时间
     *
     * @param name - 测试名称
     * @param fn - 要测量的函数
     * @param iterations - 迭代次数，默认 100
     * @returns 测量结果
     *
     * @example
     * Benchmark.measure('filterRepos', () => getFilteredRepos(repos, filter));
     */
    static measure(name: string, fn: () => void, iterations = 100): BenchmarkResult {
        const times: number[] = [];

        // 预热（避免 JIT 编译影响）
        for (let i = 0; i < 5; i++) {
            fn();
        }

        // 正式测量
        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            fn();
            times.push(performance.now() - start);
        }

        // 计算统计数据
        const sorted = [...times].sort((a, b) => a - b);
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const max = sorted[sorted.length - 1];
        const min = sorted[0];
        const p95 = sorted[Math.floor(iterations * 0.95)];

        const result: BenchmarkResult = { avg, min, max, p95 };
        this.results.set(name, result);

        // 输出结果表格
        console.table({
            [name]: {
                avg: `${avg.toFixed(2)}ms`,
                min: `${min.toFixed(2)}ms`,
                max: `${max.toFixed(2)}ms`,
                p95: `${p95.toFixed(2)}ms`
            }
        });

        return result;
    }

    /**
     * 测量异步函数执行时间
     *
     * @param name - 测试名称
     * @param fn - 要测量的异步函数
     * @param iterations - 迭代次数，默认 10（异步操作较慢）
     * @returns 测量结果
     */
    static async measureAsync(
        name: string,
        fn: () => Promise<void>,
        iterations = 10
    ): Promise<BenchmarkResult> {
        const times: number[] = [];

        // 预热
        for (let i = 0; i < 2; i++) {
            await fn();
        }

        // 正式测量
        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            await fn();
            times.push(performance.now() - start);
        }

        const sorted = [...times].sort((a, b) => a - b);
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const max = sorted[sorted.length - 1];
        const min = sorted[0];
        const p95 = sorted[Math.floor(iterations * 0.95)];

        const result: BenchmarkResult = { avg, min, max, p95 };
        this.results.set(name, result);

        console.table({
            [name]: {
                avg: `${avg.toFixed(2)}ms`,
                min: `${min.toFixed(2)}ms`,
                max: `${max.toFixed(2)}ms`,
                p95: `${p95.toFixed(2)}ms`
            }
        });

        return result;
    }

    /**
     * 比较新旧实现
     *
     * @param name - 测试名称
     * @param oldFn - 旧实现
     * @param newFn - 新实现
     * @param iterations - 迭代次数
     * @returns 比较结果
     *
     * @example
     * Benchmark.compare('getFilteredRepos',
     *   () => oldGetFilteredRepos(repos, filter),
     *   () => newGetFilteredRepos(repos, filter)
     * );
     */
    static compare(
        name: string,
        oldFn: () => void,
        newFn: () => void,
        iterations = 100
    ): ComparisonResult {
        console.log(`\n========== ${name} 性能对比 ==========`);

        console.log('\n旧实现:');
        const oldResult = this.measure(`${name} (旧)`, oldFn, iterations);

        console.log('\n新实现:');
        const newResult = this.measure(`${name} (新)`, newFn, iterations);

        const improvement = ((oldResult.avg - newResult.avg) / oldResult.avg * 100).toFixed(1);
        const emoji = parseFloat(improvement) > 0 ? '✅' : '⚠️';
        console.log(`\n${emoji} 性能变化: ${improvement}%`);

        return { oldResult, newResult, improvement };
    }

    /**
     * 获取所有测试结果
     */
    static getAllResults(): Map<string, BenchmarkResult> {
        return new Map(this.results);
    }

    /**
     * 清除所有测试结果
     */
    static clear(): void {
        this.results.clear();
    }

    /**
     * 导出 Markdown 格式报告
     * @returns Markdown 格式的报告字符串
     */
    static exportReport(): string {
        const report: string[] = [
            '# 性能基准测试报告\n',
            `> 生成时间: ${new Date().toISOString()}\n`,
            ''
        ];

        if (this.results.size === 0) {
            report.push('*暂无测试数据*\n');
            return report.join('');
        }

        report.push('| 测试项 | 平均耗时 | 最小 | 最大 | P95 |');
        report.push('|--------|---------|------|------|-----|');

        this.results.forEach((result, name) => {
            report.push(
                `| ${name} | ${result.avg.toFixed(2)}ms | ${result.min.toFixed(2)}ms | ${result.max.toFixed(2)}ms | ${result.p95.toFixed(2)}ms |`
            );
        });

        return report.join('\n');
    }

    /**
     * 打印完整报告
     */
    static printReport(): void {
        console.log('\n' + '='.repeat(50));
        console.log('性能基准测试报告');
        console.log('='.repeat(50));
        console.log(this.exportReport());
    }
}

export default Benchmark;
