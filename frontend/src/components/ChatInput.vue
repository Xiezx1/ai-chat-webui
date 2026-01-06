<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useChatStore } from "../stores/chat";
import { useToastStore } from "../stores/toast";

const chat = useChatStore();
const toast = useToastStore();
const text = ref("");
const taRef = ref<HTMLTextAreaElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const uploading = ref(0);
type Uploaded = {
  id: number;
  originalName: string;
  kind: "image" | "file";
  rawUrl?: string;
  downloadUrl?: string;
};
const attachments = ref<Uploaded[]>([]);

const canSend = computed(() => text.value.trim().length > 0 && !chat.sending && uploading.value === 0);

function autosize() {
  const el = taRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 180) + "px";
}

async function send() {
  const t = text.value;
  const hasText = t.trim().length > 0;
  const hasAttachments = attachments.value.length > 0;
  if (!hasText && !hasAttachments) return;

  const attachmentMarkdown = attachments.value
    .map((a) => {
      if (a.kind === "image" && a.rawUrl) return `![${a.originalName}](${a.rawUrl})`;
      if (a.downloadUrl) return `[${a.originalName}](${a.downloadUrl})`;
      return a.originalName;
    })
    .join("\n");

  const displayMessage = [t.trim(), attachmentMarkdown].filter(Boolean).join("\n\n");

  // 立刻清空输入框与附件（不要等到收到回复才清空）
  text.value = "";
  attachments.value = [];
  await nextTick();
  autosize();

  await chat.sendMessage(displayMessage);
}

async function uploadOne(file: File) {
  uploading.value += 1;
  try {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/files", {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.error?.message || `上传失败 (${res.status})`;
      throw new Error(msg);
    }

    const uploaded = data?.file;
    const id = Number(uploaded?.id);
    if (!Number.isFinite(id)) throw new Error("上传成功但返回的文件ID无效");

    attachments.value.push({
      id,
      originalName: uploaded?.originalName || file.name || "file",
      kind: uploaded?.kind === "image" ? "image" : "file",
      rawUrl: uploaded?.rawUrl,
      downloadUrl: uploaded?.downloadUrl,
    });
  } finally {
    uploading.value -= 1;
  }
}

async function uploadFiles(files: FileList | File[]) {
  const arr = Array.from(files || []);
  if (arr.length === 0) return;
  for (const f of arr) {
    try {
      await uploadOne(f);
    } catch (e: any) {
      toast.show(e?.message || "上传失败", "error");
    }
  }
}

function pickFiles() {
  if (chat.sending || uploading.value > 0) return;
  fileInputRef.value?.click();
}

async function onPickFiles(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files.length) {
    await uploadFiles(input.files);
  }
  // 允许重复选择同一个文件
  input.value = "";
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!chat.sending) send();
  }
}

async function onPaste(e: ClipboardEvent) {
  const files = e.clipboardData?.files;
  if (files && files.length > 0) {
    e.preventDefault();
    await uploadFiles(files);
  }
}

function removeAttachment(id: number) {
  attachments.value = attachments.value.filter((a) => a.id !== id);
}
</script>

<template>
  <div class="w-full border-t border-gray-200 bg-white">
    <div class="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 py-4">
    <div class="flex-1 rounded-2xl border border-gray-200 bg-white px-3 py-2 shadow-sm transition focus-within:ring-2 focus-within:ring-gray-200">
      <input
        ref="fileInputRef"
        class="hidden"
        type="file"
        multiple
        @change="onPickFiles"
      />

      <div v-if="attachments.length" class="mb-2 flex flex-wrap gap-2">
        <div
          v-for="a in attachments"
          :key="a.id"
          class="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-2 py-1 text-xs"
        >
          <img
            v-if="a.kind === 'image' && a.rawUrl"
            :src="a.rawUrl"
            alt=""
            class="h-8 w-8 rounded-md object-cover"
            loading="lazy"
          />
          <div class="max-w-[220px] truncate text-gray-700">{{ a.originalName }}</div>
          <button
            class="text-gray-400 hover:text-gray-900"
            type="button"
            @click="removeAttachment(a.id)"
          >
            ×
          </button>
        </div>
      </div>

      <textarea
        ref="taRef"
        v-model="text"
        rows="1"
        class="w-full resize-none bg-transparent text-[15px] leading-6 outline-none"
        placeholder="输入消息…（Enter 发送，Shift+Enter 换行）"
        @input="autosize"
        @paste="onPaste"
        @keydown="onKeydown"
      />
    </div>

    <button
      v-if="!chat.sending"
      class="shrink-0 rounded-2xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="uploading > 0"
      type="button"
      @click="pickFiles"
    >
      {{ uploading > 0 ? '上传中…' : '上传' }}
    </button>

    <button
      v-if="!chat.sending"
      class="shrink-0 rounded-2xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="(!text.trim() && attachments.length === 0) || uploading > 0"
      type="button"
      @click="send"
    >
      发送
    </button>

    <button
      v-else
      class="shrink-0 rounded-2xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 transition hover:bg-gray-50"
      type="button"
      @click="chat.abort()"
    >
      停止
    </button>
    </div>
  </div>
</template>