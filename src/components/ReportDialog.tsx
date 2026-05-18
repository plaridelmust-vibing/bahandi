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
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { financeService, Transaction } from "@/services/financeService"
import { aiService } from "@/services/aiService"
import { Timestamp } from "firebase/firestore"
import { FileDown, Sparkles } from "lucide-react"
import { toast } from "sonner"

// We need textarea component too
// npx shadcn@latest add textarea

interface ReportDialogProps {
  transactions: Transaction[];
  onSuccess: () => void;
}

export function ReportDialog({ transactions, onSuccess }: ReportDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [form, setForm] = React.useState({
    reportName: "",
    aiPrompt: "",
    frequency: "once",
    startDate: "",
    endDate: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Filter transactions based on selected range
      let targetTransactions = transactions;
      if (form.startDate || form.endDate) {
        const customStart = form.startDate ? new Date(form.startDate + 'T00:00:00') : null;
        const customEnd = form.endDate ? new Date(form.endDate + 'T23:59:59') : null;

        targetTransactions = transactions.filter(t => {
          const d = t.date instanceof Timestamp ? t.date.toDate() : (t.date as Date);
          
          if (customStart && d < customStart) return false;
          if (customEnd && d > customEnd) return false;
          return true;
        });
      }

      // 2. Generate AI Analysis
      const aiAnalysis = await aiService.analyzeFinances(targetTransactions, form.aiPrompt);
      const pdf = financeService.generatePDFReport(targetTransactions, form.reportName, aiAnalysis, { download: false });
      
      if (pdf) {
        const pdfBase64 = pdf.output('datauristring').split(',')[1];
        const netChange = targetTransactions.reduce((acc, t) => acc + t.amount, 0);

        // 3. Save template
        const templateId = await financeService.saveReportTemplate({
          reportName: form.reportName,
          aiPrompt: form.aiPrompt,
          frequency: form.frequency as any,
          status: 'active',
          startDate: form.startDate ? new Date(form.startDate + 'T00:00:00') : undefined,
          endDate: form.endDate ? new Date(form.endDate + 'T23:59:59') : undefined,
          lastRun: new Date()
        });

        // 4. Save generated report
        await financeService.saveGeneratedReport({
          reportName: form.reportName,
          transactionCount: targetTransactions.length,
          netChange,
          pdfData: pdfBase64
        });
        
        toast.success("Report generated and saved to 'Browse Reports'");
        setOpen(false);
        onSuccess();
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="sm:gap-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 w-10 px-0 justify-center sm:w-auto sm:px-4 !h-10 shrink-0">
            <Sparkles className="size-4 shrink-0" />
            <span className="hidden sm:inline">Generate Report</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>AI Report Generator</DialogTitle>
          <DialogDescription>
            Configure your reporting preferences. This will save the template and download a PDF summary.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reportName">Report Name</Label>
            <Input 
              id="reportName" 
              placeholder="e.g. April 2024 Monthly Review" 
              required 
              value={form.reportName}
              onChange={(e) => setForm({ ...form, reportName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="frequency">Frequency</Label>
            <Select 
              value={form.frequency} 
              onValueChange={(val) => setForm({ ...form, frequency: val })}
            >
              <SelectTrigger id="frequency">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once">Run Once</SelectItem>
                <SelectItem value="1min">Every 1 Minute (Test)</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input 
                id="startDate" 
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input 
                id="endDate" 
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="aiPrompt">AI Analysis Request</Label>
            <Textarea
              id="aiPrompt"
              placeholder="e.g. Summarize my spending habits this month and suggest where I can cut costs."
              required
              value={form.aiPrompt}
              onChange={(e) => setForm({ ...form, aiPrompt: e.target.value })}
            />
            <p className="text-[10px] text-muted-foreground">This prompt will be used by the Bahandi AI Agent for analysis.</p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 gap-2">
              <FileDown className="size-4" />
              {loading ? "Generating..." : "Save & Download PDF"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
