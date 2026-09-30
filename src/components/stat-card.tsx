import type { LucideIcon } from "lucide-react";
import { StatCard as DesignStatCard, type ChipTone } from "@/components/ui/stat-card";

interface StatCardProps {
  title: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: ChipTone;
}

/**
 * Legacy prop names (title / hint) kept for existing callers — renders the
 * owner-console StatCard from components/ui/stat-card.
 */
export function StatCard({ title, value, hint, icon, tone = "green" }: StatCardProps) {
  return <DesignStatCard icon={icon} tone={tone} label={title} value={value} sub={hint} />;
}
