/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from "react"
import { financeService, ReportTemplate, GeneratedReport, Transaction } from "@/services/financeService"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { safeFormat } from "@/lib/date-utils"
import { Timestamp } from "firebase/firestore"
import { 
  FileText, 
  Calendar, 
  Clock, 
  Edit2, 
  Trash2, 
  Save, 
  X, 
  Play, 
  Loader2, 
  Pause, 
  MoreVertical,
  ExternalLink,
  Download,
  ScrollText,
  FileCheck2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { aiService } from "@/services/aiService"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { toast } from "sonner"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export function ReportsPage({ transactions }: { transactions: Transaction[] }) {
  const [activeTab, setActiveTab] = React.useState("browse");
  const [templates, setTemplates] = React.useState<ReportTemplate[]>([]);
  const [generatedReports, setGeneratedReports] = React.useState<GeneratedReport[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [runningId, setRunningId] = React.useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = React.useState<ReportTemplate | null>(null);
  const [deleteReportId, setDeleteReportId] = React.useState<string | null>(null);
  const [deleteTemplateId, setDeleteTemplateId] = React.useState<string | null>(null);

  const [editForm, setEditForm] = React.useState({
    reportName: "",
    aiPrompt: "",
    frequency: "once" as ReportTemplate['frequency'],
    status: "active" as ReportTemplate['status'],
    startDate: "",
    endDate: ""
  });

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [templData, genData] = await Promise.all([
        financeService.fetchReportTemplates(),
        financeService.fetchGeneratedReports()
      ]);
      setTemplates(templData);
      setGeneratedReports(genData);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load reports data");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEditClick = (template: ReportTemplate) => {
    setEditingTemplate(template);
    setEditForm({
      reportName: template.reportName,
      aiPrompt: template.aiPrompt,
      frequency: template.frequency,
      status: template.status,
      startDate: safeFormat(template.startDate, 'yyyy-MM-dd'),
      endDate: safeFormat(template.endDate, 'yyyy-MM-dd')
    });
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate || !editingTemplate.id) return;
    try {
      await financeService.updateReportTemplate(editingTemplate.id, {
        ...editForm,
        startDate: editForm.startDate ? new Date(editForm.startDate + 'T00:00:00') : undefined,
        endDate: editForm.endDate ? new Date(editForm.endDate + 'T23:59:59') : undefined
      });
      toast.success("Template updated");
      setEditingTemplate(null);
      loadData();
    } catch {
      toast.error("Update failed");
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deleteTemplateId) return;
    try {
      await financeService.deleteReportTemplate(deleteTemplateId);
      toast.success("Template deleted");
      setDeleteTemplateId(null);
      loadData();
    } catch {
      toast.error("Deletion failed");
    }
  };

  const handleDeleteReport = async () => {
    if (!deleteReportId) return;
    try {
      await financeService.deleteGeneratedReport(deleteReportId);
      toast.success("Report deleted");
      setDeleteReportId(null);
      loadData();
    } catch {
      toast.error("Deletion failed");
    }
  };

  const handleToggleStatus = async (template: ReportTemplate) => {
    if (!template.id) return;
    try {
      const newStatus = template.status === 'active' ? 'paused' : 'active';
      await financeService.updateReportTemplate(template.id, { status: newStatus });
      toast.success(`Template ${newStatus === 'active' ? 'resumed' : 'paused'}`);
      loadData();
    } catch {
      toast.error("Status update failed");
    }
  };

  const handleRun = async (template: ReportTemplate) => {
    if (!template.id) return;
    setRunningId(template.id);
    try {
      let targetTransactions = transactions;
      if (template.startDate || template.endDate) {
        const start = template.startDate instanceof Timestamp ? template.startDate.toDate() : template.startDate;
        const end = template.endDate instanceof Timestamp ? template.endDate.toDate() : template.endDate;
        
        targetTransactions = transactions.filter(t => {
          const d = t.date instanceof Timestamp ? t.date.toDate() : t.date;
          if (start && d < start) return false;
          if (end && d > end) return false;
          return true;
        });
      }

      toast.info("Analyzing data...");
      const aiAnalysis = await aiService.analyzeFinances(targetTransactions, template.aiPrompt);
      const pdf = financeService.generatePDFReport(targetTransactions, template.reportName, aiAnalysis, { download: false });
      
      if (pdf) {
        const pdfBase64 = pdf.output('datauristring').split(',')[1];
        const netChange = targetTransactions.reduce((acc, t) => acc + t.amount, 0);

        await financeService.saveGeneratedReport({
          reportName: template.reportName,
          transactionCount: targetTransactions.length,
          netChange,
          pdfData: pdfBase64
        });

        // Update last run
        await financeService.updateReportTemplate(template.id, { lastRun: new Date() });
        
        toast.success("Report generated and saved");
        loadData();
        setActiveTab("browse");
      }
    } catch (e) {
      console.error(e);
      toast.error("Generation failed");
    } finally {
      setRunningId(null);
    }
  };

  const downloadReport = (report: GeneratedReport) => {
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${report.pdfData}`;
    link.download = `${report.reportName.replace(/\s+/g, '_')}.pdf`;
    link.click();
  };

  const openReportInNewTab = (report: GeneratedReport) => {
    try {
      const byteCharacters = atob(report.pdfData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const file = new Blob([byteArray], { type: 'application/pdf' });
      const fileURL = URL.createObjectURL(file);
      window.open(fileURL, '_blank');
    } catch (e) {
      console.error("Failed to open PDF:", e);
      toast.error("Could not open PDF in new tab");
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-4xl font-bold text-slate-900">Reports</h1>
        <p className="text-slate-500 mt-2">Access your generated reports and management templates.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="mb-8 w-full">
          <TabsList className="bg-slate-100 p-1.5 h-auto rounded-xl flex items-center w-full sm:inline-flex sm:w-auto border-none gap-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
            <TabsTrigger 
              value="browse" 
              className={cn(
                "flex-1 justify-center sm:flex-none px-4 sm:px-10 py-2.5 sm:py-2 rounded-lg transition-all font-bold text-slate-500 text-xs uppercase tracking-wider flex items-center gap-2",
                "data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-200",
                "hover:text-slate-700"
              )}
            >
              <FileCheck2 className="w-5 h-5 sm:hidden shrink-0" />
              <span className="hidden sm:inline">Browse Reports</span>
            </TabsTrigger>
            <TabsTrigger 
              value="templates" 
              className={cn(
                "flex-1 justify-center sm:flex-none px-4 sm:px-10 py-2.5 sm:py-2 rounded-lg transition-all font-bold text-slate-500 text-xs uppercase tracking-wider flex items-center gap-2",
                "data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-200",
                "hover:text-slate-700"
              )}
            >
              <ScrollText className="w-5 h-5 sm:hidden shrink-0" />
              <span className="hidden sm:inline">Manage Templates</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="browse" className="mt-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="size-8 text-indigo-600 animate-spin" />
            </div>
          ) : generatedReports.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed rounded-3xl bg-slate-50/50">
              <FileText className="size-16 text-slate-200 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900">No reports yet</h3>
              <p className="text-slate-500">Run a template or ask April to generate one for you.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {generatedReports.map((report) => (
                <Card key={report.id} id={`report-${report.id}`} className="group hover:ring-2 hover:ring-indigo-100 transition-all border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  <div 
                    className="h-32 bg-slate-50 flex items-center justify-center group-hover:bg-indigo-50/30 transition-colors cursor-pointer"
                    onClick={() => openReportInNewTab(report)}
                  >
                    <div className="size-12 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FileText className="size-6 text-indigo-600" />
                    </div>
                  </div>
                  <CardHeader className="p-4 flex flex-row items-start justify-between space-y-0">
                    <div className="space-y-1 flex-1 min-w-0">
                      <h3 className="font-bold text-slate-900 truncate pr-2" title={report.reportName}>{report.reportName}</h3>
                      <p className="text-xs text-slate-500">
                        {safeFormat(report.createdAt, 'MMM d, yyyy • h:mm a')}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={
                        <Button variant="ghost" size="icon" className="size-8 text-slate-400 shrink-0">
                          <MoreVertical className="size-4" />
                        </Button>
                      } />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openReportInNewTab(report)} className="gap-2">
                          <ExternalLink className="size-4" /> Open in New Tab
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => downloadReport(report)} className="gap-2">
                          <Download className="size-4" /> Download
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDeleteReportId(report.id!)} className="text-rose-600 gap-2">
                          <Trash2 className="size-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 border-t pt-2 grid grid-cols-2 gap-4">
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Net Change</p>
                      <p className={cn("text-xs font-bold", report.netChange >= 0 ? "text-emerald-600" : "text-rose-600")}>
                        PHP {report.netChange.toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-0.5 text-right">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Transactions</p>
                      <p className="text-xs font-bold text-slate-700">{report.transactionCount || 'PDF Report'}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates" className="mt-8">
          <div className="bg-white rounded-3xl border shadow-sm overflow-hidden border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-b">
                  <TableHead className="font-bold py-4">Report Name</TableHead>
                  <TableHead className="font-bold">Frequency</TableHead>
                  <TableHead className="font-bold">Status</TableHead>
                  <TableHead className="font-bold">Range</TableHead>
                  <TableHead className="font-bold">AI Prompt Snippet</TableHead>
                  <TableHead className="font-bold">Created At</TableHead>
                  <TableHead className="text-right font-bold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-slate-400">
                      <p>No report templates found.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  templates.map((t) => (
                    <TableRow key={t.id} className="group hover:bg-slate-50/50 border-b last:border-0">
                      <TableCell className="font-bold text-slate-900">
                        {t.reportName}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1.5 py-1 px-3 border-slate-200 text-slate-600">
                          {t.frequency === 'once' ? <FileText className="size-3" /> : <Clock className="size-3" />}
                          <span className="capitalize">{t.frequency}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={cn(
                          "gap-1.5 py-1 px-3",
                          t.status === 'active' 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        )}>
                          {t.status === 'active' ? <Play className="size-3" /> : <Pause className="size-3" />}
                          <span className="capitalize">{t.status}</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                        {t.startDate || t.endDate ? (
                          <span>
                            {safeFormat(t.startDate, 'MMM d, yyyy', '...')} - {safeFormat(t.endDate, 'MMM d, yyyy', '...')}
                          </span>
                        ) : (
                          <span className="italic opacity-50">All Time</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-slate-500 text-sm italic">
                        {t.aiPrompt}
                      </TableCell>
                      <TableCell className="text-slate-600 text-sm">
                        {safeFormat(t.createdAt, 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleToggleStatus(t)}
                            className="text-slate-400 hover:text-indigo-600 transition-colors"
                            title={t.status === 'active' ? "Pause" : "Resume"}
                          >
                            {t.status === 'active' ? <Pause className="size-4" /> : <Play className="size-4" />}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleRun(t)}
                            disabled={runningId === t.id}
                            className="text-slate-400 hover:text-emerald-600 transition-colors"
                            title="Run Template"
                          >
                            {runningId === t.id ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleEditClick(t)}
                            className="text-slate-400 hover:text-indigo-600 transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="size-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setDeleteTemplateId(t.id!)}
                            className="text-slate-400 hover:text-rose-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialogs */}
      <Dialog open={!!deleteTemplateId} onOpenChange={(open) => !open && setDeleteTemplateId(null)}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>Are you sure? This template and its recurring configuration will be removed.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-4">
            <Button variant="ghost" onClick={() => setDeleteTemplateId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteTemplate}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteReportId} onOpenChange={(open) => !open && setDeleteReportId(null)}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Report</DialogTitle>
            <DialogDescription>This will permanently delete the generated PDF file.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-4">
            <Button variant="ghost" onClick={() => setDeleteReportId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteReport}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Report Template</DialogTitle>
            <DialogDescription>Update the configuration for this report template.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Report Name</Label>
              <Input 
                value={editForm.reportName}
                onChange={(e) => setEditForm({ ...editForm, reportName: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select 
                  value={editForm.frequency} 
                  onValueChange={(val: any) => setEditForm({ ...editForm, frequency: val })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Run Once</SelectItem>
                    <SelectItem value="1min">1 Minute (Test)</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select 
                  value={editForm.status} 
                  onValueChange={(val: any) => setEditForm({ ...editForm, status: val })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={editForm.endDate} onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>AI Analysis Request</Label>
              <Textarea 
                value={editForm.aiPrompt} 
                onChange={(e) => setEditForm({ ...editForm, aiPrompt: e.target.value })} 
                className="h-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingTemplate(null)}>Cancel</Button>
            <Button onClick={handleUpdateTemplate} className="bg-indigo-600 hover:bg-indigo-700">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

