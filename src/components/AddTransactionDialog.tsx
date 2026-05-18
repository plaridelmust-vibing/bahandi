/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from "react"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { financeService } from "@/services/financeService"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { getManilaNow, safeFormat } from "@/lib/date-utils"

interface AddTransactionDialogProps {
  onSuccess: () => void;
}

export function AddTransactionDialog({ onSuccess }: AddTransactionDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [form, setForm] = React.useState({
    item: "",
    amount: "",
    category: "Food",
    date: safeFormat(getManilaNow(), 'yyyy-MM-dd')
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const isExpense = ["Food", "Clothing", "Transportation", "Loan"].includes(form.category);
      const amount = Math.abs(Number(form.amount)) * (isExpense ? -1 : 1);

      await financeService.addTransaction({
        item: form.item,
        amount: amount,
        category: form.category,
        date: new Date(form.date)
      });
      toast.success("Transaction added successfully");
      setOpen(false);
      setForm({
        item: "",
        amount: "",
        category: "Food",
        date: safeFormat(getManilaNow(), 'yyyy-MM-dd')
      });
      onSuccess();
    } catch (error) {
      toast.error("Failed to add transaction");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="bg-indigo-600 hover:bg-indigo-700 sm:gap-2 w-10 px-0 justify-center sm:w-auto sm:px-4 !h-10 shrink-0">
            <Plus className="size-4 shrink-0" />
            <span className="hidden sm:inline">Add Transaction</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Transaction</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="item">Item Description</Label>
            <Input 
              id="item" 
              placeholder="e.g. Weekly Groceries" 
              required 
              value={form.item}
              onChange={(e) => setForm({ ...form, item: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input 
                id="amount" 
                type="number" 
                placeholder="0.00" 
                required 
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground">Positive = Income, Negative = Expense</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select 
                value={form.category} 
                onValueChange={(val) => setForm({ ...form, category: val })}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Food">Food</SelectItem>
                  <SelectItem value="Clothing">Clothing</SelectItem>
                  <SelectItem value="Transportation">Transportation</SelectItem>
                  <SelectItem value="Income">Income</SelectItem>
                  <SelectItem value="Loan">Loan</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input 
              id="date" 
              type="date" 
              required 
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700">
              {loading ? "Adding..." : "Add Transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
