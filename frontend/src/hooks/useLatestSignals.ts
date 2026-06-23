import { useState, useEffect } from 'react';
import { fetchReports, fetchReport } from '../api/monitor';
import type { StockSignal } from '../types/monitor';

/** 拉取最新报告的股票信号（按置信度降序）。refreshKey 变化时重新获取。 */
export function useLatestSignals(refreshKey: number): {
  signals: StockSignal[];
  loading: boolean;
} {
  const [signals, setSignals] = useState<StockSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const reports = await fetchReports();
        const latestId = reports[0]?.id;
        if (!latestId) {
          if (!cancelled) setSignals([]);
          return;
        }
        const report = await fetchReport(latestId);
        if (cancelled) return;
        const sorted = [...report.signals].sort(
          (a, b) => b.confidence - a.confidence,
        );
        setSignals(sorted);
      } catch {
        if (!cancelled) setSignals([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { signals, loading };
}
