import { GoogleGenAI, Modality } from "@google/genai";
import { Transaction } from "./financeService";
import { safeFormat } from "../lib/date-utils";
import { tools, toolHandlers } from "../skills";

// Helper to get API Key with multiple fallbacks
const getApiKey = () => {
  // 1. Check process.env.GEMINI_API_KEY (Defined by Vite define)
  if (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  
  // 2. Check import.meta.env.VITE_GEMINI_API_KEY (Standard Vite prefix)
  const meta = import.meta as any;
  if (meta.env?.VITE_GEMINI_API_KEY) {
    return meta.env.VITE_GEMINI_API_KEY;
  }

  // 3. Check import.meta.env.GEMINI_API_KEY (If vite.config uses envPrefix: '')
  if (meta.env?.GEMINI_API_KEY) {
    return meta.env.GEMINI_API_KEY;
  }

  return "";
};

let aiInstance: GoogleGenAI | null = null;
const getAi = () => {
  if (!aiInstance) {
    const key = getApiKey();
    if (!key) {
      console.warn("GEMINI_API_KEY is missing. AI features will not work.");
    }
    aiInstance = new GoogleGenAI({ apiKey: key || "MISSING_KEY" });
  }
  return aiInstance;
};

/**
 * Robustly executes AI calls with retry logic for transient errors (like 503/High Demand).
 */
const runAiWithRetry = async <T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Look for 503, UNAVAILABLE, or high demand messages
      const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
      const isRetryable = 
        error?.error?.code === 503 || 
        error?.status === 'UNAVAILABLE' ||
        errorMsg.toLowerCase().includes('high demand') ||
        errorMsg.toLowerCase().includes('unavailable') ||
        errorMsg.includes('503');

      if (isRetryable && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000 + (Math.random() * 1000); // Exponential backoff + jitter
        console.warn(`Gemini AI experiencing high demand (503). Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

export const aiService = {
  /**
   * Generates a text summary from an uploaded image to save history size.
   */
  async summarizeImage(image: { data: string; mimeType: string }): Promise<string> {
    const ai = getAi();
    try {
      const response = await runAiWithRetry(() => ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{
          role: "user",
          parts: [
            { text: "Analyze this image and extract all relevant details (e.g., text, items, amounts, dates, category). Provide a concise text summary. Do not use markdown." },
            { inlineData: { data: image.data, mimeType: image.mimeType } }
          ]
        }]
      }));
      return response.text || "No details extracted.";
    } catch (e) {
      console.error("Image summarization failed:", e);
      return "AI failed to extract details from the image.";
    }
  },

  /**
   * Generates audio for the given text using Gemini TTS.
   */
  async generateSpeech(text: string): Promise<string | null> {
    const ai = getAi();
    try {
      // Clean up text for TTS (remove some markdown symbols if any)
      const cleanText = text.replace(/[*#_`]/g, '').trim();
      
      const response = await runAiWithRetry(() => ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: `Say with a professional and friendly tone: ${cleanText}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      }));

      const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      return audioPart?.inlineData?.data || null;
    } catch (error) {
      console.error("Speech generation failed:", error);
      return null;
    }
  },
  /**
   * Generates a financial analysis based on transactions and a specific prompt.
   */
  async analyzeFinances(transactions: Transaction[], userPrompt: string): Promise<string> {
    const ai = getAi();
    const transactionSummary = transactions.map(t => {
      const dateStr = safeFormat(t.date as any, 'yyyy-MM-dd', 'N/A');
      return `${dateStr}: ${t.item} (${t.category}) ₱${t.amount}`;
    }).join('\n');

    const prompt = `
      You are a professional financial advisor. 
      Analyze the following transactions and provide insights based on this request: "${userPrompt}"
      
      Transactions:
      ${transactionSummary}
      
      Provide a clear, structured analysis. Keep it professional but easy to understand.
      IMPORTANT: Use "PHP" for currency values. Do NOT use markdown symbols like **, ###, or lists with *. Use standard line breaks and hyphens for bullet points.
      If NO transactions are provided in the data, explicitly state that there is no transaction data for the selected period and do NOT provide hypothetical numbers.
      Limit your response to about 300 words.
    `;

    try {
      const response = await runAiWithRetry(() => ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      }));

      return response.text || "No analysis generated.";
    } catch (error) {
      console.error("AI Analysis failed:", error);
      return "Unable to generate AI analysis at this time. The model is currently under high demand.";
    }
  },

  /**
   * Handles interactive chat with the April agent, supporting tool use.
   */
  async chat(history: any[], userMessage: string, userId?: string, userLocalTime?: string, image?: { data: string, mimeType: string }): Promise<{ text: string, history: any[] }> {
    const ai = getAi();
    const currentTime = userLocalTime || new Date().toLocaleString();
    try {
      // Clean up previous history so we don't repeatedly send large base64 strings to Gemini.
      // Replace inlineData with text marker.
      let contents: any[] = history.length > 0 && history[0].parts 
        ? history.map(h => ({
            role: h.role,
            parts: h.parts.map((p: any) => {
               if (p.inlineData) {
                  return { text: "\n*[Image attached in previous turn]*" };
               }
               return p;
            })
          }))
        : history.map(h => ({
            role: h.role === 'model' ? 'model' : 'user',
            parts: [{ text: h.content }]
          }));

      let finalMessage = userMessage;

      if (image) {
         try {
             // Generate text summary to keep permanent context lightweight
             const imageSummary = await this.summarizeImage(image);
             finalMessage += `\n\n[Extracted Image Data]:\n${imageSummary}`;
         } catch (e) {
             console.error("summarization error", e);
         }
      }

      // Add current message parts
      const userParts: any[] = [{ text: finalMessage }];
      if (image) {
        // We still include it natively THIS turn so the model can read it correctly
        userParts.push({
          inlineData: {
            data: image.data,
            mimeType: image.mimeType
          }
        });
      }

      contents.push({ role: 'user', parts: userParts });

      const modelName = "gemini-3-flash-preview";
      const config = {
        systemInstruction: `You are April, a professional financial assistant for Bahandi 2.2 (Philippine context). You help users manage expenses, income, and reports. Always use PHP for currency (even if prompt says $). 

User Local Time (PH/Manila): ${currentTime}
System UTC Reference: ${new Date().toISOString()}

CRITICAL: When the user asks about their spending, expenses, or income for a specific period, ALWAYS call 'listTransactions' with the appropriate date range first to get accurate data. Do not rely on chat history for current status.

RECEIPT PROCESSING: If the user provides an image or screenshot of a receipt, analyze it carefully. Extract:
1. Item/Description (e.g. "Grocery at SM", "Coffee at Starbucks")
2. Amount in PHP
3. Date (use receipt date if visible, otherwise current local time)
4. Category (choose from: Food, Transport, Utilities, Shopping, Salary, Others)
After extracting, call 'addTransaction' to record it and confirm the details to the user.

DATE/TIME HANDLING: Use the 'User Local Time' for relative terms like 'today'. Transactions display in YYYY-MM-DD. 

REPORTING: When a user asks to generate a report:
1. Call 'listReportTemplates' and 'fetchGeneratedReports' to check if a similar template or report already exists.
2. If a report for that specific period already exists, inform the user they can find it in the "Reports" tab.
3. If not, call 'generateFinancialReport'. This will automatically save the template and the generated PDF to the database.
4. Inform the user the report is ready to view in the "Reports" tab under "Browse Reports".

To update or delete a transaction, you MUST have its ID. If you don't know the ID of the transaction the user refers to, call 'listTransactions' for the relevant period to find it. 

When you add a transaction, you will receive its ID in the tool output. Mention the ID or at least confirm the details clearly so the user knows it's recorded correctly.`,
        tools: tools as any
      };

      let response = await runAiWithRetry(() => ai.models.generateContent({
        model: modelName,
        contents: contents as any,
        config
      }));

      // Recursive tool handling
      let maxLoops = 5;
      while (response.functionCalls && response.functionCalls.length > 0 && maxLoops > 0) {
        maxLoops--;
        const calls = response.functionCalls;
        const toolResponses = await Promise.all(calls.map(async (call: any) => {
          const handler = (toolHandlers as any)[call.name];
          if (handler) {
            const output = await handler(call.args, userId);
            return {
              functionResponse: {
                name: call.name,
                response: output
              }
            };
          }
          return {
            functionResponse: {
              name: call.name,
              response: { error: "Function not found" }
            }
          };
        }));

        // Update contents with the model's call and the results
        // In @google/genai, we must send the entire candidate content back
        contents.push(response.candidates[0].content);
        contents.push({ role: 'function', parts: toolResponses as any });

        // Get next response from model
        response = await runAiWithRetry(() => ai.models.generateContent({
          model: modelName,
          contents: contents as any,
          config
        }));
      }

      // Final model response
      const finalContent = response.candidates[0].content;
      const updatedHistory = [...contents, finalContent];

      return {
        text: response.text || "I've processed your request.",
        history: updatedHistory
      };
    } catch (error) {
      console.error("Chat agent failed:", error);
      const isUnavailable = JSON.stringify(error).includes('503') || JSON.stringify(error).includes('UNAVAILABLE');
      return {
        text: isUnavailable 
          ? "The AI service is currently experiencing high demand and is temporarily unavailable. I've tried to reconnect, but it's still busy. Please try again in a few moments!"
          : "I'm having trouble thinking right now. Please try again later.",
        history
      };
    }
  }
};

