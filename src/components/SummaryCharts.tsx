/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from "react"
import { Card } from "@/components/ui/card"
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid
} from "recharts"

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

interface SummaryChartsProps {
  pieData: { name: string; value: number }[];
  trendData: { date: string; income: number; expense: number }[];
}

export function SummaryCharts({ pieData, trendData }: SummaryChartsProps) {
  const hasPieData = pieData.length > 0;
  const hasTrendData = trendData.some(d => d.income > 0 || d.expense > 0);

  return (
    <div id="charts-grid" className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
      <Card className="bg-white rounded-xl p-5 border border-slate-200 flex flex-col shadow-none h-[350px]">
        <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-tight">Spending Distribution</h3>
        <div className="flex-1 w-full flex items-center justify-center relative">
          {hasPieData ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => [`₱${value.toLocaleString()}`, "Amount"]}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-slate-400 text-sm flex flex-col items-center gap-2">
              <div className="size-12 bg-slate-50 rounded-full flex items-center justify-center">
                <span className="text-xl">📊</span>
              </div>
              No spending data available
            </div>
          )}
        </div>
      </Card>

      <Card className="bg-white rounded-xl p-5 border border-slate-200 flex flex-col shadow-none h-[350px]">
        <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-tight">Income vs Expense Trend</h3>
        <div className="flex-1 w-full flex items-center justify-center relative">
          {hasTrendData ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <Tooltip 
                  formatter={(value: number) => [`₱${value.toLocaleString()}`, ""]}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="income" 
                  stroke="#10b981" 
                  fillOpacity={1} 
                  fill="url(#colorIncome)" 
                  strokeWidth={3}
                />
                <Area 
                  type="monotone" 
                  dataKey="expense" 
                  stroke="#ef4444" 
                  fillOpacity={1} 
                  fill="url(#colorExpense)" 
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-slate-400 text-sm flex flex-col items-center gap-2">
              <div className="size-12 bg-slate-50 rounded-full flex items-center justify-center">
                <span className="text-xl">📈</span>
              </div>
              No trend data available for this month
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
