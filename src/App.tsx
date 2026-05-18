/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from "react"
import { useAuthState } from "react-firebase-hooks/auth"
import { auth } from "./lib/firebase"
import { Navbar } from "./components/Navbar"
import { StatsCards } from "./components/StatsCards"
import { SummaryCharts } from "./components/SummaryCharts"
import { TransactionTable } from "./components/TransactionTable"
import { AddTransactionDialog } from "./components/AddTransactionDialog"
import { ReportDialog } from "./components/ReportDialog"
import { ReportsPage } from "./pages/ReportsPage"
import { financeService, Transaction } from "./services/financeService"
import { Timestamp } from "firebase/firestore"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWithinInterval, eachMonthOfInterval } from "date-fns"
import { safeFormat, getManilaNow } from "@/lib/date-utils"
import { Toaster } from "@/components/ui/sonner"
import { Loader2, TrendingUp, ShieldCheck, RefreshCw } from "lucide-react"
import { Button } from "./components/ui/button"
import { DateFilter, FilterType } from "./components/DateFilter"
import { DateRange } from "react-day-picker"

export default function App() {
  const [user, loading] = useAuthState(auth);
  const [activeTab, setActiveTab] = React.useState<'dashboard' | 'reports'>('dashboard');
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);

  const loadData = React.useCallback(async () => {
    if (!user) return;
    try {
      const data = await financeService.fetchTransactions();
      setTransactions(data);
    } catch (e) {
      console.error(e);
    }
  }, [user]);

  React.useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  const [filterType, setFilterType] = React.useState<FilterType>('month');
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>({
    from: startOfMonth(getManilaNow()),
    to: endOfMonth(getManilaNow())
  });

  const filteredTransactions = React.useMemo(() => {
    if (filterType === 'all') return transactions;

    let start: Date;
    let end: Date;

    if (filterType === 'month') {
      const now = getManilaNow();
      start = startOfMonth(now);
      end = endOfMonth(now);
    } else {
      if (!dateRange?.from) return [];
      start = dateRange.from;
      const endCandidate = dateRange.to || dateRange.from;
      // Ensure end of range captures the full day
      end = new Date(endCandidate);
      end.setHours(23, 59, 59, 999);
    }

    return transactions.filter(t => {
      const d = t.date instanceof Timestamp ? t.date.toDate() : t.date as Date;
      try {
        return isWithinInterval(d, { start, end });
      } catch {
        return false;
      }
    });
  }, [transactions, filterType, dateRange]);

  // Calculations (Filtered)
  const income = filteredTransactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);
  
  const expenses = filteredTransactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = income + expenses;

  // Pie Chart Data (Filtered)
  const categories = ["Food", "Clothing", "Transportation", "Income", "Loan"];
  const pieData = categories
    .filter(cat => cat !== "Income")
    .map(cat => ({
      name: cat,
      value: Math.abs(filteredTransactions
        .filter(t => t.category === cat)
        .reduce((sum, t) => sum + t.amount, 0))
    })).filter(d => d.value > 0);

  // Trend Data for Filtered Range
  const trendData = React.useMemo(() => {
    let start: Date;
    let end: Date;
    let mode: 'day' | 'month' = 'day';

    if (filterType === 'all') {
      if (transactions.length === 0) return [];
      const dates = transactions.map(t => t.date instanceof Timestamp ? t.date.toDate() : t.date as Date);
      start = new Date(Math.min(...dates.map(d => d.getTime())));
      end = getManilaNow();
      mode = 'month';
    } else if (filterType === 'month') {
      start = startOfMonth(getManilaNow());
      end = endOfMonth(getManilaNow());
      mode = 'day';
    } else {
      if (!dateRange?.from) return [];
      start = dateRange.from;
      end = dateRange.to || dateRange.from;
      const dayDiff = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      mode = dayDiff > 62 ? 'month' : 'day';
    }

    try {
      if (mode === ('day' as string)) {
        const interval = eachDayOfInterval({ start, end });
        return interval.map(day => {
          const dayTransactions = filteredTransactions.filter(t => {
            const d = t.date instanceof Timestamp ? t.date.toDate() : t.date as Date;
            return isSameDay(d, day);
          });

          return {
            date: safeFormat(day, 'MMM dd'),
            income: dayTransactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0),
            expense: Math.abs(dayTransactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0))
          };
        });
      } else {
        const interval = eachMonthOfInterval({ start, end });
        return interval.map(month => {
          const monthTransactions = transactions.filter(t => {
            const d = t.date instanceof Timestamp ? t.date.toDate() : t.date as Date;
            return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
          });

          return {
            date: safeFormat(month, 'MMM yy'),
            income: monthTransactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0),
            expense: Math.abs(monthTransactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0))
          };
        });
      }
    } catch (e) {
      console.error("Trend calculation failed", e);
      return [];
    }
  }, [filteredTransactions, filterType, dateRange, transactions]);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <Loader2 className="size-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} onDataChange={loadData} />
      
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {!user ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
            <div className="size-20 bg-indigo-100 rounded-3xl flex items-center justify-center mb-4 transform -rotate-6">
              <TrendingUp className="size-10 text-indigo-600" />
            </div>
            <h2 className="text-4xl font-bold tracking-tight text-slate-900">Track your finances with Bahandi</h2>
            <p className="text-xl text-slate-500 max-w-md mx-auto">
              Securely track income, expenses, and manage AI-powered reports all in one place.
            </p>
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <ShieldCheck className="size-4" />
              <span>Real-time encryption & secure authentication</span>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' ? (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
                  <div>
                    <h2 className="text-3xl font-bold text-slate-900">Financial Overview</h2>
                    <p className="text-slate-500 mt-1">Hello, {user.displayName?.split(' ')[0]}. Here is what's happening with your money.</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <DateFilter 
                      filterType={filterType} 
                      onFilterTypeChange={setFilterType}
                      dateRange={dateRange}
                      onDateRangeChange={setDateRange}
                    />
                    <div className="h-8 w-px bg-slate-200 hidden md:block" />
                    <Button variant="outline" size="icon" onClick={loadData} className="!h-10 w-10 shrink-0 text-slate-500 border-slate-200 hover:bg-slate-100">
                      <RefreshCw className="size-4" />
                    </Button>
                    <ReportDialog transactions={transactions} onSuccess={() => {}} />
                    <AddTransactionDialog onSuccess={loadData} />
                  </div>
                </div>

                <StatsCards income={income} expenses={expenses} balance={balance} />
                <SummaryCharts pieData={pieData} trendData={trendData} />
                <TransactionTable transactions={filteredTransactions} onRefresh={loadData} />
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <ReportsPage transactions={transactions} />
              </div>
            )}
          </>
        )}
      </main>

      <Toaster position="top-right" />
    </div>
  )
}
