<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useChatStore } from "../stores/chat";

const chat = useChatStore();
const text = ref("");
const taRef = ref<HTMLTextAreaElement | null>(null);

const canSend = computed(() => text.value.trim().length > 0 && !chat.sending);

function autosize() {
  const el = taRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 180) + "px";
}

async function send() {
  const t = text.value;
  if (!t.trim()) return;
  await chat.sendMessage(t);
  // 如果不是发送中（正常/停止/失败都会进入非 sending），清空输入框
  text.value = "";
  await nextTick();
  autosize();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!chat.sending) send();
  }
}
</script>

<template>
  <div class="w-full flex gap-2 px-4 py-4">
    <div class="flex-1 rounded-2xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <textarea
        ref="taRef"
        v-model="text"
        rows="1"
        class="w-full resize-none bg-transparent text-[15px] leading-6 outline-none"
        placeholder="输入消息…（Enter 发送，Shift+Enter 换行）"
        @input="autosize"
        @keydown="onKeydown"
      />
    </div>

    <button
      v-if="!chat.sending"
      class="rounded-2xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
      :disabled="!text.trim()"
      type="button"
      @click="send"
    >
      发送
    </button>

    <button
      v-else
      class="rounded-2xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
      type="button"
      @click="chat.abort()"
    >
      停止
    </button>
  </div>
</template>