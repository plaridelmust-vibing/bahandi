/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from "react"
import { Card } from "@/components/ui/card"
import { ArrowUpCircle, ArrowDownCircle, Wallet } from "lucide-react"

interface StatsCardsProps {
  income: number;
  expenses: number;
  balance: number;
}

export function StatsCards({ income, expenses, balance }: StatsCardsProps) {
  const stats = [
    {
      title: "Total Income",
      value: income,
      icon: ArrowUpCircle,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      title: "Total Expenses",
      value: expenses,
      icon: ArrowDownCircle,
      color: "text-rose-600",
      bg: "bg-rose-50",
    },
    {
      title: "Net Balance",
      value: balance,
      icon: Wallet,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
    },
  ];

  return (
    <div id="stats-grid" className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
      {stats.map((stat) => (
        <Card key={stat.title} className="bg-white rounded-xl p-5 border border-slate-200 flex flex-col gap-1 shadow-none">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {stat.title}
          </span>
          <span className={`text-3xl font-bold ${stat.color}`}>
            {stat.value < 0 ? "-" : ""}₱{Math.abs(stat.value).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </Card>
      ))}
    </div>
  )
}
