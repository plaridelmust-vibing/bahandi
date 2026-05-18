/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from "react"
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger, 
  SheetFooter
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  MessageCircle, 
  Send, 
  Loader2, 
  Sparkles, 
  User, 
  Bot, 
  Volume2, 
  VolumeX, 
  Square, 
  Trash2, 
  Image as ImageIcon, 
  X,
  FileText,
  ExternalLink
} from "lucide-react"
import { aiService } from "../services/aiService"
import { auth, db } from "../lib/firebase"
import { financeService } from "../services/financeService"
import { collection, query, where, getDocs, setDoc, doc, Timestamp, orderBy, limit, deleteDoc } from "firebase/firestore"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import ReactMarkdown from "react-markdown"

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  image?: string;
  reportId?: string;
}

interface ChatPaneProps {
  onDataChange?: () => void;
}

export function ChatPane({ onDataChange }: ChatPaneProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [fullHistory, setFullHistory] = React.useState<any[]>([]);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [selectedImage, setSelectedImage] = React.useState<{ data: string, mimeType: string, preview: string } | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [isSpeechEnabled, setIsSpeechEnabled] = React.useState(false);
  const [isSpeaking, setIsSpeaking] = React.useState(false);
  
  const [showConfirmClear, setShowConfirmClear] = React.useState(false);
  
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const sourceNodeRef = React.useRef<AudioBufferSourceNode | null>(null);

  const userId = auth.currentUser?.uid;
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Derive UI messages from full history
  React.useEffect(() => {
    const uiMessages: ChatMessage[] = [];
    
    for (let i = 0; i < fullHistory.length; i++) {
      const h = fullHistory[i];
      if ((h.role === 'user' || h.role === 'model') && h.parts) {
        const textPart = h.parts.find((p: any) => p.text);
        const imagePart = h.parts.find((p: any) => p.inlineData);
        
        const message: ChatMessage = {
          role: h.role,
          content: textPart?.text || "",
          image: imagePart?.inlineData ? `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}` : undefined
        };

        // If this is a model message, look back for any tool result that might belong to it
        if (h.role === 'model') {
           // Look at the previous history entry. For Gemini, it's often user -> model (call) -> function (result) -> model (confirmation)
           // If we are at index i, maybe the reportId is at index i-1
           const prev = fullHistory[i-1];
           if (prev && (prev.role === 'function' || prev.role === 'tool')) {
             const toolPart = prev.parts?.find((p: any) => p.functionResponse);
             if (toolPart?.functionResponse?.name === 'generateFinancialReport') {
               const reportId = toolPart.functionResponse.response?.reportId;
               if (reportId) {
                 message.reportId = reportId;
               }
             }
           }
        }

        if (message.content || message.image) {
          uiMessages.push(message);
        }
      }
    }
    
    setMessages(uiMessages);
  }, [fullHistory]);

  const stopSpeaking = () => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    setIsSpeaking(false);
  };

  const playSpeech = async (text: string) => {
    if (!isSpeechEnabled) return;
    
    try {
      setIsSpeaking(true);
      const base64Audio = await aiService.generateSpeech(text);
      if (!base64Audio) {
        setIsSpeaking(false);
        return;
      }

      // Initialize or reuse AudioContext
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const audioCtx = audioContextRef.current;
      
      // Ensure we are in a running state
      if (audioCtx.state === 'suspended') {
        try {
          await audioCtx.resume();
        } catch (e) {
          console.warn("Failed to resume audio context:", e);
        }
      }
      
      // Stop any existing playback
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop();
        } catch (e) {
          // Ignore errors if already stopped
        }
      }

      // Convert base64 to ArrayBuffer
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const arrayBuffer = bytes.buffer;

      // Note: gemini-3.1-flash-tts-preview with Modality.AUDIO returns PCM 16-bit 24kHz Mono by default
      const int16Array = new Int16Array(arrayBuffer);
      const audioBuffer = audioCtx.createBuffer(1, int16Array.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      
      for (let i = 0; i < int16Array.length; i++) {
        // Normalize to -1.0 to 1.0
        channelData[i] = int16Array[i] / 32768.0;
      }

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      source.onended = () => {
        setIsSpeaking(false);
        sourceNodeRef.current = null;
      };
      
      sourceNodeRef.current = source;
      source.start(0);
    } catch (error) {
      console.error("Audio playback failed:", error);
      setIsSpeaking(false);
    }
  };

  const loadHistory = React.useCallback(async () => {
    if (!userId) return;
    setHistoryLoading(true);
    try {
      const q = query(
        collection(db, "chat_history"),
        where("userId", "==", userId),
        orderBy("updatedAt", "desc"),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        setFullHistory(data.messages || []);
      }
    } catch (e) {
      console.error("Failed to load chat history:", e);
    } finally {
      setHistoryLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, loadHistory]);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const saveHistory = async (newHistory: any[]) => {
    if (!userId) return;
    try {
      const historyToSave = newHistory.map(h => ({
        role: h.role,
        parts: h.parts.map((p: any) => {
          if (p.inlineData) {
            return { text: "\n*[Image removed for storage efficiency]*" };
          }
          return p;
        }),
        timestamp: Timestamp.now()
      }));

      await setDoc(doc(db, "chat_history", userId), {
        userId,
        messages: historyToSave,
        updatedAt: Timestamp.now()
      });
    } catch (e) {
      console.error("Failed to save history:", e);
    }
  };

  const handleViewReport = async (reportId: string) => {
    try {
      const report = await financeService.getGeneratedReport(reportId);
      if (report && report.pdfData) {
        const pdfWindow = window.open("");
        if (pdfWindow) {
          pdfWindow.document.write(
            `<html><head><title>${report.reportName}</title></head><body style="margin:0;padding:0;">
              <iframe width="100%" height="100%" src="data:application/pdf;base64,${report.pdfData}" style="border:none;"></iframe>
            </body></html>`
          );
        } else {
          // Fallback if popup blocked: download it
          const link = document.createElement('a');
          link.href = `data:application/pdf;base64,${report.pdfData}`;
          link.download = `${report.reportName.replace(/\s+/g, '_')}.pdf`;
          link.click();
        }
      } else {
        toast.error("Report content not found.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load PDF.");
    }
  };

  const clearHistory = async () => {
    if (!userId) return;
    
    if (!showConfirmClear) {
      setShowConfirmClear(true);
      setTimeout(() => setShowConfirmClear(false), 3000);
      return;
    }
    
    try {
      await deleteDoc(doc(db, "chat_history", userId));
      setFullHistory([]);
      setShowConfirmClear(false);
      toast.success("Chat history cleared");
    } catch (e) {
      toast.error("Failed to clear history");
    }
  };

  const initAudio = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    // Play a tiny silent buffer to "unlock" audio on mobile
    const silentBuffer = audioContextRef.current.createBuffer(1, 1, 22050);
    const node = audioContextRef.current.createBufferSource();
    node.buffer = silentBuffer;
    node.connect(audioContextRef.current.destination);
    node.start(0);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const base64Data = result.split(',')[1];
      setSelectedImage({
        data: base64Data,
        mimeType: file.type,
        preview: result
      });
    };
    reader.readAsDataURL(file);
    // Clear the input so the same file can be selected again
    e.target.value = '';
  };

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;

    // Prime audio on gesture
    if (isSpeechEnabled) {
      initAudio().catch(console.error);
    }

    const userMessage = input.trim();
    const currentImage = selectedImage;
    
    setInput("");
    setSelectedImage(null);
    
    // Add user message to history immediately for UI feedback
    const userParts: any[] = [{ text: userMessage || "Analyze this receipt." }];
    if (currentImage) {
      userParts.push({
        inlineData: {
          data: currentImage.data,
          mimeType: currentImage.mimeType
        }
      });
    }

    const optimisticHistory = [...fullHistory, { role: 'user', parts: userParts }];
    setFullHistory(optimisticHistory);
    setIsLoading(true);

    try {
      const userLocalTime = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'full', timeStyle: 'short' });
      const imagePayload = currentImage ? { data: currentImage.data, mimeType: currentImage.mimeType } : undefined;
      const response = await aiService.chat(fullHistory, userMessage || "Analyze this receipt.", userId, userLocalTime, imagePayload);
      
      // If the tool cleared the history, we should clear it locally too
      if (response.text.toLowerCase().includes("cleared") && 
          (response.text.toLowerCase().includes("history") || response.text.toLowerCase().includes("chat"))) {
        setFullHistory([]);
      } else {
        setFullHistory(response.history);
        await saveHistory(response.history);
      }

      // Play audio response if enabled
      if (isSpeechEnabled) {
        playSpeech(response.text);
      }
      
      // If a tool was likely called (heuristics: text mentions success), refresh data
      if (response.text.toLowerCase().includes("added") || 
          response.text.toLowerCase().includes("updated") || 
          response.text.toLowerCase().includes("deleted") ||
          response.text.toLowerCase().includes("generated")) {
        onDataChange?.();
      }
    } catch (e) {
      console.error(e);
      toast.error("April is busy right now.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="relative">
            <MessageCircle className="size-5" />
            <span className="sr-only">Open Chat</span>
          </Button>
        }
      />
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col h-full overflow-hidden">
        <SheetHeader className="p-4 border-b shrink-0 flex flex-row items-center justify-between space-y-0 pr-12">
          <SheetTitle className="flex items-center gap-2">
            <div className="size-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Sparkles className="size-4 text-white" />
            </div>
            <span>April Agent</span>
          </SheetTitle>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={clearHistory} 
            className={cn(
              "transition-colors", 
              showConfirmClear ? "text-red-600 bg-red-50 hover:bg-red-100 w-16" : "text-slate-400 hover:text-red-500"
            )}
            title={showConfirmClear ? "Click again to confirm" : "Clear Chat History"}
          >
            {showConfirmClear ? <span className="text-[10px] font-bold">CONFIRM</span> : <Trash2 className="size-4" />}
          </Button>
        </SheetHeader>

        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {messages.length === 0 && !historyLoading && (
                <div className="text-center py-10 space-y-2">
                  <p className="text-slate-500">How can I help you today?</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setInput("Add 300 for dinner")}>Add 300 for dinner</Button>
                    <Button variant="outline" size="sm" onClick={() => setInput("Summarize my expenses")}>Summarize expenses</Button>
                  </div>
                </div>
              )}
              
              {historyLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 className="size-6 animate-spin text-slate-300" />
                </div>
              )}

              {messages.map((m, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "flex gap-3 max-w-[85%]",
                    m.role === 'user' ? "ml-auto flex-row-reverse" : ""
                  )}
                >
                  <div className={cn(
                    "size-8 rounded-full flex items-center justify-center shrink-0",
                    m.role === 'user' ? "bg-slate-200" : "bg-indigo-100"
                  )}>
                    {m.role === 'user' ? <User className="size-4 text-slate-600" /> : <Bot className="size-4 text-indigo-600" />}
                  </div>
                  <div className={cn(
                    "rounded-2xl px-4 py-2 text-sm space-y-2",
                    m.role === 'user' 
                      ? "bg-indigo-600 text-white rounded-tr-none" 
                      : "bg-slate-100 text-slate-900 rounded-tl-none"
                  )}>
                    {m.image && (
                      <div className="rounded-lg overflow-hidden mb-2 max-w-[200px]">
                        <img src={m.image} alt="User upload" className="w-full h-auto" referrerPolicy="no-referrer" />
                      </div>
                    )}
                    {m.role === 'user' ? (
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="markdown-body">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                        {m.reportId && (
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="w-full flex items-center gap-2 bg-white hover:bg-slate-50 text-indigo-600 border border-indigo-100 shadow-sm transition-all group"
                            onClick={() => handleViewReport(m.reportId!)}
                          >
                            <FileText className="size-4 shrink-0" />
                            <span className="flex-1 text-left">View Financial Report</span>
                            <ExternalLink className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3 max-w-[85%]">
                  <div className="size-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                    <Bot className="size-4 text-indigo-600" />
                  </div>
                  <div className="bg-slate-100 rounded-2xl rounded-tl-none px-4 py-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>
        </div>

        <div className="px-4 py-2 border-t bg-slate-50 flex flex-col gap-2 shrink-0">
          {selectedImage && (
            <div className="relative size-16 group">
              <img src={selectedImage.preview} className="size-full object-cover rounded-md border" alt="Preview" referrerPolicy="no-referrer" />
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute -top-1 -right-1 bg-white rounded-full border shadow-sm p-0.5 hover:text-red-500 transition-colors"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
          <div className="flex flex-row items-center gap-2">
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleImageSelect}
            />
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => fileInputRef.current?.click()}
              className="text-slate-400 hover:text-indigo-600 shrink-0"
              disabled={isLoading}
            >
              <ImageIcon className="size-4" />
            </Button>
            <Input 
              placeholder="Type a message or upload receipt..." 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={isLoading}
              className="flex-1"
            />
            <div className="flex items-center gap-1">
              {isSpeaking && (
                <Button variant="ghost" size="icon" onClick={stopSpeaking} className="text-red-500 animate-pulse h-9 w-9">
                  <Square className="size-3 fill-current" />
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => {
                  const newEnabled = !isSpeechEnabled;
                  setIsSpeechEnabled(newEnabled);
                  if (newEnabled) {
                    initAudio().catch(console.error);
                  }
                }}
                className={cn("h-9 w-9 transition-colors", isSpeechEnabled ? "text-indigo-600 bg-indigo-50" : "text-slate-400")}
                title={isSpeechEnabled ? "Disable Speech" : "Enable Speech"}
              >
                {isSpeechEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              </Button>
              <Button size="icon" onClick={handleSend} disabled={isLoading || (!input.trim() && !selectedImage)} className="h-9 w-9">
                <Send className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
