/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from "react"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { Transaction, financeService } from "@/services/financeService"
import { safeFormat, getManilaNow } from "@/lib/date-utils"
import { format } from "date-fns"
import { Trash2, Save, Plus, X, RefreshCw } from "lucide-react"
import { Timestamp } from "firebase/firestore"
import { toast } from "sonner"

interface TransactionTableProps {
  transactions: Transaction[];
  onRefresh: () => void;
}

export function TransactionTable({ transactions, onRefresh }: TransactionTableProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Partial<Transaction>>({});
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

  const handleEdit = (transaction: Transaction) => {
    setEditingId(transaction.id || null);
    setDraft({
      ...transaction,
      date: transaction.date instanceof Timestamp ? transaction.date.toDate() : transaction.date
    });
    setConfirmDeleteId(null);
  };

  const handleSave = async () => {
    if (!editingId) return;
    try {
      const isExpense = ["Food", "Clothing", "Transportation", "Loan"].includes(draft.category || "");
      const amount = Math.abs(Number(draft.amount)) * (isExpense ? -1 : 1);
      
      const { id, userId, ...cleanUpdates } = draft;
      const updatePayload = {
        item: draft.item,
        category: draft.category,
        date: draft.date,
        amount
      };
      await financeService.updateTransaction(editingId, updatePayload);
      toast.success("Transaction updated");
      setEditingId(null);
      onRefresh();
    } catch (e) {
      toast.error("Failed to update transaction");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await financeService.deleteTransaction(id);
      toast.success("Transaction deleted");
      setConfirmDeleteId(null);
      onRefresh();
    } catch (e) {
      toast.error("Failed to delete transaction");
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setDraft({});
    setConfirmDeleteId(null);
  };


  return (
    <div id="transaction-table" className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-none">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
        <h3 className="text-base font-bold text-slate-900">Transactions</h3>
      </div>
      
      <div className="overflow-x-auto">
        <Table className="text-sm">
          <TableHeader>
            <TableRow className="bg-slate-50 border-b border-slate-200">
              <TableHead className="px-6 py-3 font-bold text-slate-500 uppercase tracking-wider text-[11px] w-[150px]">Date</TableHead>
              <TableHead className="px-6 py-3 font-bold text-slate-500 uppercase tracking-wider text-[11px]">Item</TableHead>
              <TableHead className="px-6 py-3 font-bold text-slate-500 uppercase tracking-wider text-[11px]">Category</TableHead>
              <TableHead className="px-6 py-3 font-bold text-slate-500 uppercase tracking-wider text-[11px] text-right">Amount</TableHead>
              <TableHead className="px-6 py-3 font-bold text-slate-500 uppercase tracking-wider text-[11px] w-[100px] text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t) => {
              const isEditing = editingId === t.id;
              const displayDate = t.date instanceof Timestamp ? t.date.toDate() : t.date;

              const getCategoryStyle = (cat: string) => {
                switch(cat) {
                  case 'Food': return 'bg-rose-100 text-rose-800';
                  case 'Transportation': return 'bg-sky-100 text-sky-800';
                  case 'Income': return 'bg-emerald-100 text-emerald-800';
                  case 'Loan': return 'bg-amber-100 text-amber-800';
                  default: return 'bg-slate-100 text-slate-800';
                }
              };

              return (
                <TableRow key={t.id} className="group border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <TableCell className="px-6 py-3">
                    {isEditing ? (
                      <Input 
                        type="date" 
                        className="h-8 py-1 rounded-md border-slate-200"
                        value={safeFormat(draft.date as Date, 'yyyy-MM-dd', safeFormat(getManilaNow(), 'yyyy-MM-dd'))}
                        onChange={(e) => {
                          const date = new Date(e.target.value);
                          if (!isNaN(date.getTime())) {
                            setDraft({ ...draft, date });
                          }
                        }}
                      />
                    ) : (
                      <span className="text-slate-500 border-b border-dashed border-slate-300 cursor-pointer" onClick={() => handleEdit(t)}>
                        {safeFormat(displayDate as Date, 'MM-dd-yyyy')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-6 py-3">
                    {isEditing ? (
                      <Input 
                        className="h-8 py-1 rounded-md border-slate-200"
                        value={draft.item || ""}
                        onChange={(e) => setDraft({ ...draft, item: e.target.value })}
                      />
                    ) : (
                      <span className="font-medium text-slate-700 border-b border-dashed border-slate-300 cursor-pointer" onClick={() => handleEdit(t)}>
                        {t.item}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-6 py-3">
                    {isEditing ? (
                      <Select 
                        value={draft.category} 
                        onValueChange={(val) => setDraft({ ...draft, category: val })}
                      >
                        <SelectTrigger className="h-8 py-1 rounded-md border-slate-200">
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Food">Food</SelectItem>
                          <SelectItem value="Clothing">Clothing</SelectItem>
                          <SelectItem value="Transportation">Transportation</SelectItem>
                          <SelectItem value="Income">Income</SelectItem>
                          <SelectItem value="Loan">Loan</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-tight ${getCategoryStyle(t.category)}`} onClick={() => handleEdit(t)}>
                        {t.category}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={`px-6 py-3 text-right font-bold ${t.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'} border-b border-dashed border-transparent cursor-pointer group-hover:border-slate-300`}>
                    {isEditing ? (
                      <Input 
                        type="number"
                        className="h-8 py-1 text-right rounded-md border-slate-200"
                        value={draft.amount || 0}
                        onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
                      />
                    ) : (
                      <span onClick={() => handleEdit(t)}>
                        {t.amount >= 0 ? "+" : ""}₱{Math.abs(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-6 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {isEditing ? (
                        <>
                          <Button variant="ghost" size="icon" onClick={handleSave} className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                            <Save className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={handleCancel} className="h-8 w-8 text-slate-400 hover:text-slate-500 hover:bg-slate-50">
                            <X className="size-4" />
                          </Button>
                        </>
                      ) : confirmDeleteId === t.id ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id!)} className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold px-2">
                            Confirm
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setConfirmDeleteId(null)} className="h-8 w-8 text-slate-400 hover:text-slate-500 hover:bg-slate-50">
                            <X className="size-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(t)} className="h-8 w-8 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all">
                            <Plus className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setConfirmDeleteId(t.id!)} className="h-8 w-8 text-rose-300 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all">
                            <Trash2 className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-slate-400 bg-slate-50/20">
                  No transactions yet. Click "+ Add Transaction" to begin.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
