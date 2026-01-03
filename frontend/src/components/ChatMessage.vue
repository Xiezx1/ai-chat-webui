<script setup lang="ts">
import MarkdownRender from "./MarkdownRender.vue";
import type { Message } from "../stores/chat";

const props = defineProps<{
  message: Message;
}>();

async function copyMessage() {
  try {
    await navigator.clipboard.writeText(props.message.content || "");
  } catch {
    // fallback：不做复杂兼容，一期先这样
    alert("复制失败：请在 HTTPS 或 localhost 环境使用复制功能");
  }
}
</script>

<template>
  <div class="py-3">
    <div
      class="group mx-auto flex max-w-3xl gap-3 px-4"
      :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
    >
      <div
        class="rounded-2xl px-4 py-3 text-[15px] leading-7"
        :class="message.role === 'user'
          ? 'bg-gray-900 text-white'
          : 'bg-white text-gray-900 border border-gray-200'"
      >
        <div class="mb-2 flex items-center justify-between gap-3">
          <div class="text-xs text-gray-400">
            {{ message.role === 'user' ? 'You' : 'Assistant' }}
          </div>

          <button
            class="invisible rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 group-hover:visible"
            type="button"
            @click="copyMessage"
          >
            复制消息
          </button>
        </div>

        <div v-if="message.role === 'assistant'">
          <MarkdownRender :content="message.content" />
        </div>
        <div v-else class="whitespace-pre-wrap break-words">
          {{ message.content }}
        </div>
      </div>
    </div>
  </div>
</template>