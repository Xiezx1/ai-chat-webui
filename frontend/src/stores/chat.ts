import { defineStore } from "pinia";
import { apiFetch } from "../services/api";
import router from "../router";
import { useToastStore } from "./toast";
import { useSettingsStore } from "./settings";
import { useAuthStore } from "./auth";

export type Conversation = {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string;
  lastMessageRole?: string;
  lastMessageAt?: string | null;
};

export type Message = {
  id: number;
  role: "user" | "assistant" | string;
  content: string;
  createdAt: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
  estimated?: boolean; // 标记是否为估算值
};

function extractFileIdsFromText(text: string): number[] {
  if (!text) return [];
  const ids = new Set<number>();
  const re = /\/api\/files\/(\d+)\/(?:raw|download)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const id = Number(m[1]);
    if (Number.isFinite(id)) ids.add(id);
  }
  return Array.from(ids);
}

function stripFileMarkdownLines(text: string): string {
  const lines = String(text || "").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // 只剔除我们自动插入的文件/图片 Markdown 行，避免把普通内容误删
    if (/^!\[[^\]]*\]\(\/api\/files\/\d+\/(?:raw|download)\)$/.test(trimmed)) continue;
    if (/^\[[^\]]+\]\(\/api\/files\/\d+\/(?:raw|download)\)$/.test(trimmed)) continue;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

type NdjsonEvent =
  | { type: "meta"; conversationId: number; assistantMessageId: number }
  | { type: "delta"; text: string }
  | { type: "error"; error: { code: string; message: string } }
  | { type: "done" };

export const useChatStore = defineStore("chat", {
  state: () => ({
    conversations: [] as Conversation[],
    activeId: null as number | null,
    messages: [] as Message[],

    sending: false,
    abortController: null as AbortController | null,

    lastUserText: "" as string,
    error: "" as string, // 用于页面底部错误条 + 重试
  }),

  getters: {
    // 获取当前对话的token统计
    currentConversationStats() {
      if (!this.activeId) return null;

      const messages = this.messages.filter(m => m.role !== 'system');
      const totalTokens = messages.reduce((sum, msg) => sum + (msg.totalTokens || 0), 0);
      const totalCost = messages.reduce((sum, msg) => sum + (msg.cost || 0), 0);

      return {
        messageCount: messages.length,
        totalTokens,
        totalCost,
        promptTokens: messages.reduce((sum, msg) => sum + (msg.promptTokens || 0), 0),
        completionTokens: messages.reduce((sum, msg) => sum + (msg.completionTokens || 0), 0)
      };
    },

    // 获取token使用百分比
    tokenUsagePercentage() {
      const stats = this.currentConversationStats;
      if (!stats) return 0;

      const maxTokens = 4000; // 默认上下文长度

      return Math.min((stats.totalTokens / maxTokens) * 100, 100);
    }
  },

  actions: {
    async loadConversations() {
      const toast = useToastStore();
      const auth = useAuthStore();
      try {
        const res = await apiFetch<{ conversations: Conversation[] }>("/api/conversations");
        this.conversations = res.conversations;
      } catch (err: any) {
        if (err?.status === 401) {
          auth.user = null;
          this.conversations = [];
          this.activeId = null;
          this.messages = [];
          toast.show("登录已失效，请重新登录", "error");
          await router.push("/login");
          return;
        }
        throw err;
      }
    },

    async createConversation() {
      const toast = useToastStore();
      const auth = useAuthStore();
      try {
        const res = await apiFetch<{ conversation: Conversation }>("/api/conversations", {
          method: "POST",
          body: JSON.stringify({ title: "New Chat" }),
        });
        this.conversations = [res.conversation, ...this.conversations];
        this.activeId = res.conversation.id;
        this.messages = [];
        return res.conversation;
      } catch (err: any) {
        if (err?.status === 401) {
          auth.user = null;
          toast.show("登录已失效，请重新登录", "error");
          await router.push("/login");
          return;
        }
        toast.show(err?.message || "新建会话失败", "error");
        throw err;
      }
    },

    async renameConversation(id: number, title: string) {
      const res = await apiFetch<{ conversation: Conversation }>(`/api/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      this.conversations = this.conversations.map((c) => (c.id === id ? res.conversation : c));
    },

    async deleteConversation(id: number) {
      const toast = useToastStore();
      try {
        await apiFetch(`/api/conversations/${id}`, { method: "DELETE" });
      } catch (err: any) {
        toast.show(err?.message || "删除会话失败", "error");
        throw err;
      }

      this.conversations = this.conversations.filter((c) => c.id !== id);
      if (this.activeId === id) {
        this.activeId = null;
        this.messages = [];
      }

      toast.show("已删除会话", "success");
    },

    async openConversation(id: number) {
      this.activeId = id;
      const res = await apiFetch<{ messages: Message[] }>(`/api/conversations/${id}/messages`);
      this.messages = res.messages;
    },

    abort() {
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
      // 体验优化：立刻让按钮回到“可发送”（不用等 catch/finally）
      this.sending = false;
    },

    async sendMessage(text: string) {
      const toast = useToastStore();
      const t = text.trim();
      if (!t || this.sending) return;

      this.error = "";
      this.sending = true;
      this.lastUserText = t;

      // 本地先插入 user 消息
      this.messages.push({
        id: Date.now(),
        role: "user",
        content: t,
        createdAt: new Date().toISOString(),
      });

      // 插入一个“占位”的 assistant 消息（流式会不断追加到这条上）
      const assistantLocalId = Date.now() + 1;
      this.messages.push({
        id: assistantLocalId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      });
      const assistantIndex = this.messages.length - 1;

      const controller = new AbortController();
      this.abortController = controller;

      // 简单节流：把 delta 先堆在 pending 里，每 50ms 刷一次到 Vue state
      let pending = "";
      let timer: any = null;

      const flush = () => {
        if (!pending) return;
        const msg = this.messages[assistantIndex];
        if (msg) msg.content += pending; // 用数组内对象更新，保证响应式触发
        pending = "";
      };

      const scheduleFlush = () => {
        if (timer) return;
        timer = setTimeout(() => {
          timer = null;
          flush();
        }, 300);
      };

      try {
        const settings = useSettingsStore();
        const model = settings.userSettings.defaultModel || "openai/gpt-4o-mini";

        const fileIds = extractFileIdsFromText(text);
        const prompt = stripFileMarkdownLines(text);

        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: controller.signal,
          body: JSON.stringify({
            conversationId: this.activeId,
            message: t,
            prompt,
            model: model,
            fileIds,
          }),
        });

        // 非 200（比如 key 无效/限流）就按普通错误处理
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          const msg = data?.error?.message || `请求失败 (${res.status})`;
          throw new Error(msg);
        }
        if (!res.body) throw new Error("浏览器不支持流式读取");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        let buf = "";
        let finished = false;

        const finishNow = () => {
          // 立刻让 UI 回到“发送”，不要依赖连接关闭
          this.sending = false;
          this.abortController = null;
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });

          // NDJSON：按行切
          const lines = buf.split("\n");
          buf = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            const evt = JSON.parse(line) as NdjsonEvent;

            if (evt.type === "meta") {
              // 可能是新会话：后端会告诉我们 conversationId
              if (!this.activeId) this.activeId = evt.conversationId;

              // 把后端真实的 assistantMessageId 写回到本地占位消息
              const msg = this.messages[assistantIndex];
              if (msg) msg.id = evt.assistantMessageId;

              await this.loadConversations();
              continue;
            }

            if (evt.type === "delta") {
              pending += evt.text || "";
              scheduleFlush();
              continue;
            }

            if (evt.type === "error") {
              // 流内错误（后端会发），显示友好提示 + 允许重试
              flush();
              this.error = evt.error?.message || "生成失败，请重试";
              finished = true;
              finishNow();
              break;
            }

            if (evt.type === "done") {
              flush();
              finished = true;
              finishNow();
              break;
            }
          }

          if (finished) {
            // 主动结束读取，避免连接未及时关闭导致 UI 一直处于 sending
            reader.cancel().catch(() => {});
            break;
          }
        }

        flush();
        if (this.activeId) {
          const res = await apiFetch<{ messages: Message[] }>(`/api/conversations/${this.activeId}/messages`);
          this.messages = res.messages;

          // 更新当前会话的摘要（避免需要刷新列表才能看到最新一句）
          const conv = this.conversations.find((c) => c.id === this.activeId);
          const last = this.messages[this.messages.length - 1];
          if (conv && last) {
            const t = String(last.content || "").replace(/\s+/g, " ").trim();
            conv.lastMessagePreview = t.length > 80 ? t.slice(0, 80) + "…" : t;
            conv.lastMessageRole = last.role;
            conv.updatedAt = new Date().toISOString();
          }
        }
      } catch (e: any) {
        if (e?.name === "AbortError") {
          this.error = "已停止生成";
          toast.show(this.error, "info");
        } else {
          const msg = e?.message || "发送失败";
          this.error = msg;
          toast.show(msg, "error");

          // 统一处理认证失效，匹配各种登录相关错误信息
          if (msg.includes("登录") || msg.includes("请先登录") || msg.includes("登录已失效") || msg.includes("请重新登录")) {
            router.push("/login");
          }
        }
      } finally {
        if (timer) clearTimeout(timer);
        this.sending = false;
        this.abortController = null;
      }
    },

    async retryLast() {
      if (!this.lastUserText) return;
      await this.sendMessage(this.lastUserText);
    },
  },
});