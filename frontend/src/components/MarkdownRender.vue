<script setup lang="ts">
import { computed, onMounted, onUpdated, ref } from "vue";
import { renderMarkdown } from "../utils/markdown";

const props = defineProps<{ content: string }>();
const rootRef = ref<HTMLElement | null>(null);

const html = computed(() => renderMarkdown(props.content || ""));

async function copyText(text: string) {
  // clipboard 在 https 或 localhost 才稳定
  await navigator.clipboard.writeText(text);
}

function bindCopyButtons() {
  const root = rootRef.value;
  if (!root) return;
  const btns = root.querySelectorAll<HTMLButtonElement>("button.copy-code");
  btns.forEach((btn) => {
    if ((btn as any).__bound) return;
    (btn as any).__bound = true;

    btn.addEventListener("click", async () => {
      const encoded = btn.getAttribute("data-code") || "";
      const code = decodeURIComponent(encoded);
      try {
        await copyText(code);
        btn.textContent = "已复制";
        setTimeout(() => (btn.textContent = "复制代码"), 1000);
      } catch {
        btn.textContent = "复制失败";
        setTimeout(() => (btn.textContent = "复制代码"), 1000);
      }
    });
  });
}

onMounted(bindCopyButtons);
onUpdated(bindCopyButtons);
</script>

<template>
  <div ref="rootRef" class="prose prose-slate max-w-none" v-html="html"></div>
</template>

<style scoped>
/* 让 prose 更像 ChatGPT：不那么大、间距更克制一点 */
.prose :deep(p) { margin: 0.5rem 0; }
.prose :deep(ul), .prose :deep(ol) { margin: 0.5rem 0; }
.prose :deep(pre) { margin: 0; }
</style>