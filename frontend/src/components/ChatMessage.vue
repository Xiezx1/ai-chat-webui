<script setup lang="ts">
import MarkdownRender from "./MarkdownRender.vue";
import type { Message } from "../stores/chat";
import { computed } from "vue";

const props = defineProps<{
  message: Message;
}>();

type UserPart =
  | { type: "text"; text: string }
  | { type: "image"; alt: string; src: string }
  | { type: "link"; text: string; href: string };

function parseUserParts(content: string): UserPart[] {
  const lines = String(content || "").split("\n");
  const parts: UserPart[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // ![alt](url)
    const img = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(trimmed);
    if (img) {
      parts.push({ type: "image", alt: img[1] || "image", src: img[2] });
      continue;
    }

    // [text](url)
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(trimmed);
    if (link) {
      parts.push({ type: "link", text: link[1], href: link[2] });
      continue;
    }

    parts.push({ type: "text", text: line });
  }

  return parts;
}

const userParts = computed(() => parseUserParts(props.message.content));

const timeText = computed(() => {
  const d = new Date(props.message.createdAt);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
});

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
      class="group flex w-full gap-3"
      :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
    >
      <div
        class="max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-7 shadow-sm"
        
        :class="
          message.role === 'user'
            ? 'bg-gray-900 text-white'
            : 'bg-white text-gray-900 border border-gray-200'
        "
      >
        <div class="mb-2 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <div class="text-xs" :class="message.role === 'user' ? 'text-gray-300' : 'text-gray-400'">
              {{ message.role === "user" ? "你" : "AI" }}
            </div>
            <div class="text-xs" :class="message.role === 'user' ? 'text-gray-400' : 'text-gray-500'">
              {{ timeText }}
            </div>
          </div>

          <div class="flex items-center gap-2">
            <!-- Token统计信息（仅对assistant消息显示） -->
            <div
              v-if="message.role === 'assistant' && message.totalTokens"
              class="text-xs text-gray-500"
            >
              {{ message.totalTokens }} tokens
              <span v-if="message.estimated" class="text-amber-600">(估算)</span>
              <span v-if="message.cost !== undefined && message.cost !== null" class="text-green-600">
                ${{ message.cost.toFixed(4) }}
              </span>
            </div>

            <button
              class="invisible rounded-md px-2 py-1 text-xs group-hover:visible"
              :class="
                message.role === 'user'
                  ? 'border border-gray-700 bg-gray-800 text-gray-100 hover:bg-gray-700'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              "
              type="button"
              @click="copyMessage"
            >
              复制消息
            </button>
          </div>
        </div>

        <div v-if="message.role === 'assistant'">
          <MarkdownRender :content="message.content" />
        </div>
        <div v-else class="whitespace-pre-wrap break-words">
          <template v-for="(p, idx) in userParts" :key="idx">
            <div v-if="p.type === 'image'" class="my-2">
              <img
                :src="p.src"
                :alt="p.alt"
                class="max-w-full rounded-lg"
                loading="lazy"
              />
            </div>
            <div v-else-if="p.type === 'link'" class="my-1">
              <a class="underline" :href="p.href" target="_blank" rel="noreferrer">{{ p.text }}</a>
            </div>
            <div v-else>
              {{ p.text }}
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
