export type PlanName = 'free' | 'pro' | 'enterprise';

export interface PlanLimits {
  maxProjects: number;
  maxComparisonsPerMonth: number;
  maxCopilotPerMonth: number;
  maxStorageBytes: number;
  allowPdfExport: boolean;
}

const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: {
    maxProjects: 3,
    maxComparisonsPerMonth: 5,
    maxCopilotPerMonth: 5,
    maxStorageBytes: 500 * 1024 * 1024, // 500 MB
    allowPdfExport: false,
  },
  pro: {
    maxProjects: Infinity,
    maxComparisonsPerMonth: Infinity,
    maxCopilotPerMonth: 100,
    maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5 GB
    allowPdfExport: true,
  },
  enterprise: {
    maxProjects: Infinity,
    maxComparisonsPerMonth: Infinity,
    maxCopilotPerMonth: Infinity,
    maxStorageBytes: 50 * 1024 * 1024 * 1024, // 50 GB
    allowPdfExport: true,
  },
};

export function getPlanLimits(plan: PlanName): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function canCreateProject(plan: PlanName, currentCount: number): boolean {
  const limits = getPlanLimits(plan);
  return currentCount < limits.maxProjects;
}

export function canRunComparison(plan: PlanName, monthlyCount: number): boolean {
  const limits = getPlanLimits(plan);
  return monthlyCount < limits.maxComparisonsPerMonth;
}

export function canUseCopilot(plan: PlanName, monthlyCount: number): boolean {
  const limits = getPlanLimits(plan);
  return monthlyCount < limits.maxCopilotPerMonth;
}

export function canUploadFile(plan: PlanName, currentStorageBytes: number, newFileBytes: number): boolean {
  const limits = getPlanLimits(plan);
  return (currentStorageBytes + newFileBytes) <= limits.maxStorageBytes;
}

export function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
