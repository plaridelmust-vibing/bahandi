/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { financeService } from "../services/financeService";
import { aiService } from "../services/aiService";
import { toValidDate, startOfDay, endOfDay, safeFormat, getManilaNow } from "../lib/date-utils";
import { db } from "../lib/firebase";
import { doc, deleteDoc } from "firebase/firestore";

/**
 * Tool definitions for Gemini Function Calling
 */
export const tools = [
  {
    functionDeclarations: [
      {
        name: "addTransaction",
        description: "Add a new financial transaction (income or expense).",
        parameters: {
          type: "object",
          properties: {
            item: {
              type: "string",
              description: "Description of the transaction (e.g., 'Lunch at Jollibee').",
            },
            category: {
              type: "string",
              description: "Category of the transaction. Must be one of: Food, Clothing, Transportation, Income, Loan.",
            },
            amount: {
              type: "number",
              description: "Amount of the transaction. Use positive for income and negative for expenses.",
            },
            date: {
              type: "string",
              description: "Date of the transaction in YYYY-MM-DD format. Optional, defaults to today.",
            }
          },
          required: ["item", "category", "amount"],
        },
      },
      {
        name: "listTransactions",
        description: "List the recent transactions for the user. Each transaction will include an 'id' that must be used to update or delete it. You can filter by date range.",
        parameters: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "The maximum number of transactions to return (default is 10).",
            },
            startDate: {
              type: "string",
              description: "Filter transactions from this date (inclusive) in YYYY-MM-DD format.",
            },
            endDate: {
              type: "string",
              description: "Filter transactions up to this date (inclusive) in YYYY-MM-DD format.",
            }
          },
        },
      },
      {
        name: "updateTransaction",
        description: "Update an existing transaction using its unique ID.",
        parameters: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique ID of the transaction to update.",
            },
            item: {
              type: "string",
              description: "New description of the transaction.",
            },
            category: {
              type: "string",
              description: "New category. Must be one of: Food, Clothing, Transportation, Income, Loan.",
            },
            amount: {
              type: "number",
              description: "New amount. Use positive for income and negative for expenses.",
            },
            date: {
              type: "string",
              description: "New date in YYYY-MM-DD format.",
            }
          },
          required: ["id"],
        },
      },
      {
        name: "deleteTransaction",
        description: "Delete an existing transaction using its unique ID.",
        parameters: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique ID of the transaction to delete.",
            }
          },
          required: ["id"],
        },
      },
      {
        name: "generateFinancialReport",
        description: "Generate a PDF financial report with specific transactions, save it to the database, and create a template for it.",
        parameters: {
          type: "object",
          properties: {
            reportName: {
              type: "string",
              description: "Title of the report (e.g., 'Q1 2026 Financial Report').",
            },
            aiPrompt: {
              type: "string",
              description: "A custom prompt for AI analysis to include in the report. Briefly explain what the AI should focus on (e.g. 'budgeting tips for Q1').",
            },
            startDate: {
              type: "string",
              description: "The start date for the report in YYYY-MM-DD format (ISO 8601). Required for specific period reports like 'Q1 2026'.",
            },
            endDate: {
              type: "string",
              description: "The end date for the report in YYYY-MM-DD format (ISO 8601). Required for specific period reports like 'Q1 2026'.",
            },
            frequency: {
              type: "string",
              enum: ["once", "1min", "daily", "monthly"],
              description: "How often this report should be triggered (default is 'once').",
            }
          },
          required: ["reportName"],
        },
      },
      {
        name: "listReportTemplates",
        description: "List the existing report templates for the user. Use this to check if a similar report already exists.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "fetchGeneratedReports",
        description: "List the already generated PDF reports for the user. Use this to check if a report was already created for a specific period.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "clearChatHistory",
        description: "Clears the entire chat history with April. Use this when the user explicitly asks to clear the chat, delete history, or start over.",
        parameters: {
          type: "object",
          properties: {},
        },
      }
    ],
  },
];

/**
 * Tool implementation handlers
 */
export const toolHandlers = {
  addTransaction: async (args: any, userId?: string) => {
    const { item, category, amount, date } = args;
    const dateObj = toValidDate(date) || getManilaNow();
    const id = await financeService.addTransaction({
      item,
      category,
      amount,
      date: dateObj,
    }, userId);
    return { success: true, id, message: `Added ${item} (PHP ${Math.abs(amount)}) to ${category}. (ID: ${id})` };
  },
  listTransactions: async (args: any, userId?: string) => {
    const { limit = 10, startDate, endDate } = args;
    const filter: { from?: Date; to?: Date } = {};
    if (startDate) {
      const d = toValidDate(startDate);
      if (d) filter.from = startOfDay(d);
    }
    if (endDate) {
      const d = toValidDate(endDate);
      if (d) filter.to = endOfDay(d);
    }

    const transactions = await financeService.fetchTransactions(Object.keys(filter).length > 0 ? filter : undefined, userId);
    const list = transactions.slice(0, limit).map(t => {
       const d = (t.date as any).toDate ? (t.date as any).toDate() : t.date;
       return `ID: ${t.id} | Date: ${safeFormat(d, 'yyyy-MM-dd')} | Item: ${t.item} | Amount: PHP ${t.amount} | Category: ${t.category}`;
    });
    return { transactions: list };
  },
  updateTransaction: async (args: any, _userId?: string) => {
    const { id, ...updates } = args;
    try {
      await financeService.updateTransaction(id, updates);
      return { success: true, message: `Transaction ${id} has been updated successfully.` };
    } catch (e) {
      console.error("Failed to update transaction:", e);
      return { success: false, message: `Failed to update transaction ${id}.` };
    }
  },
  deleteTransaction: async (args: any, _userId?: string) => {
    const { id } = args;
    try {
      await financeService.deleteTransaction(id);
      return { success: true, message: `Transaction ${id} has been deleted successfully.` };
    } catch (e) {
      console.error("Failed to delete transaction:", e);
      return { success: false, message: `Failed to delete transaction ${id}.` };
    }
  },
  generateFinancialReport: async (args: any, userId?: string) => {
    const { reportName, aiPrompt, startDate, endDate, frequency = 'once' } = args;
    
    const filter: { from?: Date; to?: Date } = {};
    if (startDate) {
      const d = toValidDate(startDate);
      if (d) filter.from = startOfDay(d);
    }
    if (endDate) {
      const d = toValidDate(endDate);
      if (d) filter.to = endOfDay(d);
    }

    const transactions = await financeService.fetchTransactions(Object.keys(filter).length > 0 ? filter : undefined, userId);
    
    // Generate AI Insights first
    const aiAnalysis = await aiService.analyzeFinances(transactions, aiPrompt || "Provide a summary of the income and expenses for this period.");
    
    // Generate PDF (but don't download it automatically from here)
    const pdf = financeService.generatePDFReport(transactions, reportName, aiAnalysis, { download: false });
    
    if (pdf) {
      const pdfBase64 = pdf.output('datauristring').split(',')[1];
      const netChange = transactions.reduce((acc, t) => acc + t.amount, 0);

      // Save template if it doesn't exist (we could also check here, but the model is instructed to check)
      await financeService.saveReportTemplate({
        reportName,
        aiPrompt: aiPrompt || "Standard financial analysis",
        frequency,
        status: 'active',
        startDate: filter.from,
        endDate: filter.to,
        lastRun: new Date()
      }, userId);

      // Save generated report
      const reportId = await financeService.saveGeneratedReport({
        reportName,
        transactionCount: transactions.length,
        netChange,
        pdfData: pdfBase64
      }, userId);

      return { 
        success: true, 
        reportId,
        message: `Report "${reportName}" has been generated and saved to the database. It is now available in the "Reports" tab under "Browse Reports". A template has also been added to "Manage Templates".` 
      };
    }

    return { success: false, message: "Failed to generate PDF document." };
  },
  listReportTemplates: async (_args: any, userId?: string) => {
    const templates = await financeService.fetchReportTemplates(userId);
    const list = templates.map(t => {
      return `Template Name: ${t.reportName} | Frequency: ${t.frequency} | Status: ${t.status} | Range: ${safeFormat(t.startDate, 'yyyy-MM-dd')} to ${safeFormat(t.endDate, 'yyyy-MM-dd')}`;
    });
    return { templates: list };
  },
  fetchGeneratedReports: async (_args: any, userId?: string) => {
    const reports = await financeService.fetchGeneratedReports(userId);
    const list = reports.map(r => {
      return `Report Name: ${r.reportName} | Created At: ${safeFormat(r.createdAt, 'yyyy-MM-dd HH:mm')} | Transactions: ${r.transactionCount}`;
    });
    return { reports: list };
  },
  clearChatHistory: async (args: any, userId?: string) => {
    if (!userId) return { success: false, message: "User not authenticated" };
    try {
      await deleteDoc(doc(db, "chat_history", userId));
      return { success: true, message: "Chat history cleared successfully. April has been reset." };
    } catch (e) {
      console.error("Failed to clear chat history:", e);
      return { success: false, message: "Failed to clear chat history." };
    }
  }
};
