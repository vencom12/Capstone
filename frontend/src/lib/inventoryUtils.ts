export type StockLevelTier = 'all' | 'critical' | 'low' | 'moderate' | 'high';

export interface StockLevelInfo {
  tier: 'critical' | 'low' | 'moderate' | 'high';
  label: string;
  badgeClass: string;
  dotColor: string;
  description: string;
  percentageOfThreshold: number;
}

/**
 * Computes the 4-tier stock level: Critical, Low, Moderate, High.
 * 
 * - Critical: count === 0 (Depleted) or count <= 50% of minThreshold (Emergency reorder)
 * - Low: count > 50% of minThreshold && count <= minThreshold (Below safety margin)
 * - Moderate: count > minThreshold && count <= 2.5 * minThreshold (Healthy operational buffer)
 * - High: count > 2.5 * minThreshold (Abundant inventory)
 */
export function computeStockLevel(count: number = 0, minThreshold: number = 10): StockLevelInfo {
  const threshold = Number(minThreshold) > 0 ? Number(minThreshold) : 10;
  const currentCount = Math.max(0, Number(count) || 0);
  const ratio = (currentCount / threshold) * 100;

  if (currentCount <= 0) {
    return {
      tier: 'critical',
      label: 'Critical (Depleted)',
      badgeClass: 'bg-danger/15 text-danger border border-danger/30',
      dotColor: '#f43f5e',
      description: 'Zero stock! Material or product is depleted.',
      percentageOfThreshold: 0
    };
  }

  const criticalCutoff = Math.max(1, Math.floor(threshold * 0.5));
  if (currentCount <= criticalCutoff) {
    return {
      tier: 'critical',
      label: 'Critical Stock',
      badgeClass: 'bg-danger/15 text-danger border border-danger/30',
      dotColor: '#f43f5e',
      description: 'Critically low (<= 50% of safety threshold). Restock immediately.',
      percentageOfThreshold: Math.round(ratio)
    };
  }

  if (currentCount <= threshold) {
    return {
      tier: 'low',
      label: 'Low Stock',
      badgeClass: 'bg-primary/15 text-primary border border-primary/30',
      dotColor: '#f59e0b',
      description: 'Below safety threshold. Reordering advised.',
      percentageOfThreshold: Math.round(ratio)
    };
  }

  if (currentCount <= threshold * 2.5) {
    return {
      tier: 'moderate',
      label: 'Moderate',
      badgeClass: 'bg-white/5 text-text-dim border border-border-glass',
      dotColor: '#38bdf8',
      description: 'Healthy inventory within normal operational margins.',
      percentageOfThreshold: Math.round(ratio)
    };
  }

  return {
    tier: 'high',
    label: 'High Stock',
    badgeClass: 'bg-white/10 text-text-main border border-border-glass',
    dotColor: '#34d399',
    description: 'Abundant stock available.',
    percentageOfThreshold: Math.round(ratio)
  };
}
