/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDoc,
  query, 
  where, 
  getDocs, 
  orderBy,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { safeFormat, toValidDate, getManilaNow } from '../lib/date-utils';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface Transaction {
  id?: string;
  date: Date | Timestamp;
  item: string;
  category: string;
  amount: number;
  userId: string;
}

export interface GeneratedReport {
  id?: string;
  userId: string;
  reportName: string;
  createdAt: Date | Timestamp;
  netChange: number;
  transactionCount: number;
  pdfData: string; // Base64
}

export interface ReportTemplate {
  id?: string;
  userId: string;
  reportName: string;
  aiPrompt: string;
  frequency: 'once' | '1min' | 'daily' | 'monthly';
  status: 'active' | 'paused';
  createdAt: Date | Timestamp;
  lastRun?: Date | Timestamp;
  startDate?: Date | Timestamp;
  endDate?: Date | Timestamp;
}

export const financeService = {
  /**
   * Adds a new transaction to Firestore.
   * Validates that amount is a number and date is present.
   */
  async addTransaction(data: Omit<Transaction, 'id' | 'userId'>, overrideUserId?: string) {
    const userId = overrideUserId || auth.currentUser?.uid;
    if (!userId) throw new Error("User not authenticated");

    const path = 'transactions';
    try {
      // Ensure date is a Timestamp
      let dateValue: Timestamp;
      const validDate = toValidDate(data.date);
      if (validDate) {
        dateValue = Timestamp.fromDate(validDate);
      } else {
        dateValue = Timestamp.fromDate(getManilaNow());
      }

      const docRef = await addDoc(collection(db, path), {
        ...data,
        userId,
        date: dateValue,
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  /**
   * Updates an existing transaction.
   */
  async updateTransaction(id: string, updates: Partial<Omit<Transaction, 'id' | 'userId'>>) {
    const path = `transactions/${id}`;
    try {
      const docRef = doc(db, 'transactions', id);
      const formattedUpdates: Record<string, unknown> = { ...updates };
      
      if (updates.date) {
        const validDate = toValidDate(updates.date);
        if (validDate) {
          formattedUpdates.date = Timestamp.fromDate(validDate);
        } else {
          delete formattedUpdates.date;
        }
      }
      
      await updateDoc(docRef, formattedUpdates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  /**
   * Deletes a transaction.
   */
  async deleteTransaction(id: string) {
    const path = `transactions/${id}`;
    try {
      await deleteDoc(doc(db, 'transactions', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  /**
   * Fetches transactions for the current user with optional date filtering.
   */
  async fetchTransactions(filter?: { from?: Date; to?: Date }, overrideUserId?: string) {
    const userId = overrideUserId || auth.currentUser?.uid;
    if (!userId) return [];

    const path = 'transactions';
    try {
      let q = query(
        collection(db, path),
        where('userId', '==', userId),
        orderBy('date', 'desc')
      );

      if (filter?.from) {
        q = query(q, where('date', '>=', Timestamp.fromDate(filter.from)));
      }
      if (filter?.to) {
        q = query(q, where('date', '<=', Timestamp.fromDate(filter.to)));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Transaction[];
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  /**
   * Generates a PDF report of transactions.
   */
  generatePDFReport(transactions: Transaction[], reportName: string = "Financial Report", aiAnalysis?: string, options: { download?: boolean } = { download: true }) {
    if (typeof window === 'undefined') {
      console.warn("PDF generation is skipped in non-browser environments.");
      return null;
    }
    const pdfDoc = new jsPDF();
    
    // Header
    pdfDoc.setFontSize(22);
    pdfDoc.setTextColor(30, 41, 59); // slate-800
    pdfDoc.text(reportName, 14, 25);
    
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(100);
    pdfDoc.text(`Generated on ${safeFormat(getManilaNow(), 'PPpp')}`, 14, 32);

    // Date Range Indicator
    if (transactions.length > 0) {
      const dates = transactions.map(t => t.date instanceof Timestamp ? t.date.toDate() : t.date as Date);
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      pdfDoc.setFontSize(9);
      pdfDoc.text(`Period: ${format(minDate, 'MMM dd, yyyy')} - ${format(maxDate, 'MMM dd, yyyy')}`, 14, 38);
    }

    // Summary section
    const totalIncome = transactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = Math.abs(transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0));
    const netBalance = totalIncome - totalExpense;

    pdfDoc.setFontSize(12);
    pdfDoc.setTextColor(30, 41, 59);
    pdfDoc.text("Financial Summary", 14, 48);
    
    pdfDoc.setFontSize(10);
    pdfDoc.text(`Total Income: PHP ${totalIncome.toLocaleString()}`, 14, 55);
    pdfDoc.text(`Total Expenses: PHP ${totalExpense.toLocaleString()}`, 14, 61);
    pdfDoc.text(`Net Balance: PHP ${netBalance.toLocaleString()}`, 14, 67);

    let currentY = 78;

    // AI Analysis section
    if (aiAnalysis) {
      pdfDoc.setFontSize(12);
      pdfDoc.setTextColor(79, 70, 229); // indigo-600
      pdfDoc.text("AI Insights & Analysis", 14, currentY);
      
      pdfDoc.setFontSize(9);
      pdfDoc.setTextColor(51, 65, 85); // slate-700
      
      const cleanAnalysis = aiAnalysis
        .replace(/#{1,6}\s?/g, '') // Strip headers
        .replace(/\*\*(.*?)\*\*/g, '$1') // Strip bold
        .replace(/\*(.*?)\*/g, '$1') // Strip italic
        .replace(/±/g, 'PHP ') 
        .replace(/₱/g, 'PHP ') 
        .replace(/^\s*[-*]\s/gm, '• '); 

      const splitText = pdfDoc.splitTextToSize(cleanAnalysis, 180);
      pdfDoc.text(splitText, 14, currentY + 7);
      
      currentY += 15 + (splitText.length * 4);
    }

    // Transactions Table
    const tableData = transactions.map(t => [
      safeFormat(t.date, 'MMM dd, yyyy'),
      t.item,
      t.category,
      { 
        content: `PHP ${t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        styles: { textColor: (t.amount >= 0 ? [22, 101, 52] : [153, 27, 27]) as [number, number, number] }
      }
    ]);

    autoTable(pdfDoc, {
      startY: currentY,
      head: [['Date', 'Description', 'Category', 'Amount']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], fontSize: 10, cellPadding: 4 }, 
      bodyStyles: { fontSize: 9, cellPadding: 3 },
      alternateRowStyles: { fillColor: [248, 250, 252] }, 
      margin: { top: 10 },
      didDrawPage: (data) => {
        pdfDoc.setFontSize(8);
        pdfDoc.setTextColor(150);
        pdfDoc.text(`Page ${data.pageNumber}`, pdfDoc.internal.pageSize.width - 20, pdfDoc.internal.pageSize.height - 10);
      }
    });

    if (options.download) {
      pdfDoc.save(`${reportName.replace(/\s+/g, '_')}.pdf`);
    }

    return pdfDoc;
  },

  /**
   * Saves a report template to Firestore.
   */
  async saveReportTemplate(template: Omit<ReportTemplate, 'id' | 'userId' | 'createdAt'>, overrideUserId?: string) {
    const userId = overrideUserId || auth.currentUser?.uid;
    if (!userId) throw new Error("User not authenticated");

    const path = 'reports';
    try {
      const data: Record<string, unknown> = {
        reportName: template.reportName,
        aiPrompt: template.aiPrompt,
        frequency: template.frequency,
        status: template.status || 'active',
        userId,
        createdAt: serverTimestamp(),
      };

      if (template.startDate) {
        const d = toValidDate(template.startDate);
        if (d) data.startDate = Timestamp.fromDate(d);
      }
      if (template.endDate) {
        const d = toValidDate(template.endDate);
        if (d) data.endDate = Timestamp.fromDate(d);
      }
      if (template.lastRun) {
        const d = toValidDate(template.lastRun);
        if (d) data.lastRun = Timestamp.fromDate(d);
      }

      const docRef = await addDoc(collection(db, path), data);
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  /**
   * Fetches report templates for the current user.
   */
  async fetchReportTemplates(overrideUserId?: string) {
    const userId = overrideUserId || auth.currentUser?.uid;
    if (!userId) return [];

    const path = 'reports';
    try {
      const q = query(
        collection(db, path),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ReportTemplate[];
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  /**
   * Updates an existing report template.
   */
  async updateReportTemplate(id: string, updates: Partial<Omit<ReportTemplate, 'id' | 'userId' | 'createdAt'>>) {
    const path = `reports/${id}`;
    try {
      const docRef = doc(db, 'reports', id);
      const formattedUpdates: Record<string, unknown> = {};

      if (updates.reportName !== undefined) formattedUpdates.reportName = updates.reportName;
      if (updates.aiPrompt !== undefined) formattedUpdates.aiPrompt = updates.aiPrompt;
      if (updates.frequency !== undefined) formattedUpdates.frequency = updates.frequency;
      if (updates.status !== undefined) formattedUpdates.status = updates.status;

      if (updates.startDate !== undefined) {
        const d = toValidDate(updates.startDate);
        if (d) formattedUpdates.startDate = Timestamp.fromDate(d);
        else formattedUpdates.startDate = null; // Use null for explicit clearing
      }
      if (updates.endDate !== undefined) {
        const d = toValidDate(updates.endDate);
        if (d) formattedUpdates.endDate = Timestamp.fromDate(d);
        else formattedUpdates.endDate = null;
      }
      if (updates.lastRun !== undefined) {
        const d = toValidDate(updates.lastRun);
        if (d) formattedUpdates.lastRun = Timestamp.fromDate(d);
      }
      
      await updateDoc(docRef, formattedUpdates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  /**
   * Deletes a report template.
   */
  async deleteReportTemplate(id: string) {
    const path = `reports/${id}`;
    try {
      await deleteDoc(doc(db, 'reports', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  /**
   * Generated Reports Methods
   */
  async saveGeneratedReport(report: Omit<GeneratedReport, 'id' | 'userId' | 'createdAt'>, overrideUserId?: string) {
    const userId = overrideUserId || auth.currentUser?.uid;
    if (!userId) throw new Error("User not authenticated");

    const path = 'generated_reports';
    try {
      const docRef = await addDoc(collection(db, path), {
        ...report,
        userId,
        createdAt: serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async fetchGeneratedReports(overrideUserId?: string) {
    const userId = overrideUserId || auth.currentUser?.uid;
    if (!userId) return [];

    const path = 'generated_reports';
    try {
      const q = query(
        collection(db, path),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as GeneratedReport[];
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  async deleteGeneratedReport(id: string) {
    const path = `generated_reports/${id}`;
    try {
      await deleteDoc(doc(db, 'generated_reports', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  async getGeneratedReport(id: string) {
    const path = `generated_reports/${id}`;
    try {
      const docRef = doc(db, 'generated_reports', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as GeneratedReport;
      }
      return null;
    } catch (error) {
       // Simple fallback
       console.error("Failed to get report:", error);
       return null;
    }
  }
};
