<script setup lang="ts">
import { useToastStore } from "../stores/toast";
const toast = useToastStore();

function cls(type: string) {
  if (type === "error") return "border-red-200 bg-red-50 text-red-900";
  if (type === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  return "border-gray-200 bg-white text-gray-900";
}
</script>

<template>
  <div class="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2">
    <div
      v-for="t in toast.toasts"
      :key="t.id"
      class="pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-sm"
      :class="cls(t.type)"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="leading-6">{{ t.message }}</div>
        <button class="text-xs opacity-70 hover:opacity-100" @click="toast.dismiss(t.id)">关闭</button>
      </div>
    </div>
  </div>
</template>