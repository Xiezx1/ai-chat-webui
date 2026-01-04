<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useSettingsStore } from "../stores/settings";
import { useToastStore } from "../stores/toast";

const router = useRouter();
const settings = useSettingsStore();
const toast = useToastStore();

const searchQuery = ref("");
const selectedModel = ref("");

// 计算属性
const filteredModels = computed(() => {
  if (!searchQuery.value.trim()) {
    return settings.sortedModels;
  }
  
  const query = searchQuery.value.toLowerCase().trim();
  const models = settings.sortedModels;
  
  // 创建匹配结果数组，每个模型都有匹配分数
  const scoredModels = models.map(model => {
    let score = 0;
    const nameLower = model.name.toLowerCase();
    const descLower = model.description.toLowerCase();
    const idLower = model.id.toLowerCase();
    
    // 模型名称完全匹配 (最高优先级)
    if (nameLower === query) {
      score += 1000;
    }
    // 模型名称开头匹配 (高优先级)
    else if (nameLower.startsWith(query)) {
      score += 500;
    }
    // 模型名称包含匹配 (中等优先级)
    else if (nameLower.includes(query)) {
      score += 300;
    }
    
    // ID开头匹配 (中优先级)
    if (idLower.startsWith(query)) {
      score += 200;
    }
    // ID包含匹配 (低优先级)
    else if (idLower.includes(query)) {
      score += 150;
    }
    
    // 描述匹配 (最低优先级)
    if (descLower.includes(query)) {
      score += 50;
    }
    
    return { model, score };
  });
  
  // 按分数降序排序，分数相同的按名称排序
  return scoredModels
    .filter(item => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.model.name.localeCompare(b.model.name, 'zh-CN');
    })
    .map(item => item.model);
});

// 搜索高亮文本
const highlightText = (text: string, query: string) => {
  if (!query.trim()) return text;
  
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>');
};

const isDefaultModel = (modelId: string) => {
  return settings.userSettings.defaultModel === modelId;
};

// 方法
async function refreshModels() {
  try {
    await settings.loadModels();
    toast.show("模型列表已刷新", "success");
  } catch (error: any) {
    toast.show(error.message || "刷新失败", "error");
  }
}

function setDefaultModel(modelId: string) {
  settings.setDefaultModel(modelId);
  toast.show(`已将 ${settings.models.find(m => m.id === modelId)?.name} 设为默认模型`, "success");
}

function goBack() {
  router.push("/chat");
}

function formatPrice(price: string, type: 'prompt' | 'completion' = 'prompt') {
  const num = parseFloat(price);
  if (num === 0) return "免费";
  
  // OpenRouter官方格式：每M tokens的价格
  const pricePerMillion = num * 1000000;
  
  // 根据价格大小选择合适的格式
  if (pricePerMillion < 0.01) {
    // 小于0.01美元，使用更精确的显示
    return `$${pricePerMillion.toFixed(4)}/M tokens`;
  } else if (pricePerMillion < 1) {
    // 小于1美元，保留2位小数
    return `$${pricePerMillion.toFixed(2)}/M tokens`;
  } else {
    // 大于等于1美元，保留1位小数
    return `$${pricePerMillion.toFixed(1)}/M tokens`;
  }
}

function formatContextLength(length: number) {
  if (length >= 1000000) {
    return `${(length / 1000000).toFixed(1)}M`;
  } else if (length >= 1000) {
    return `${(length / 1000).toFixed(0)}K`;
  }
  return length.toString();
}

function getArchitectureIcon(modality: string) {
  if (modality.includes("image")) return "🖼️";
  if (modality.includes("video")) return "🎥";
  return "📝";
}

// 生命周期
onMounted(async () => {
  await settings.init();
  selectedModel.value = settings.userSettings.defaultModel;
});
</script>

<template>
  <div class="h-screen bg-gray-50">
    <!-- Header -->
    <header class="border-b border-gray-200 bg-white">
      <div class="mx-auto max-w-6xl px-4 py-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <button
              class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              @click="goBack"
            >
              ← 返回聊天
            </button>
            <h1 class="text-xl font-semibold text-gray-900">系统设置</h1>
          </div>
          <button
            class="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black"
            @click="refreshModels"
            :disabled="settings.loading"
          >
            {{ settings.loading ? "加载中..." : "刷新模型" }}
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="mx-auto max-w-6xl p-6">
      <!-- 搜索和默认模型显示 -->
      <div class="mb-6 space-y-4">
        <!-- 搜索框 -->
        <div class="relative">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索模型..."
            class="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pl-10 text-sm placeholder-gray-500 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
          <div class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            🔍
          </div>
        </div>

        <!-- 当前默认模型 -->
        <div class="rounded-xl border border-gray-200 bg-white p-4">
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-blue-100 p-2">
              <span class="text-lg">🤖</span>
            </div>
            <div class="flex-1">
              <h3 class="text-sm font-medium text-gray-900">当前默认模型</h3>
              <p class="text-sm text-gray-600">
                {{ settings.defaultModel?.name || '未设置' }}
              </p>
            </div>
            <div class="text-right">
              <div class="text-xs text-gray-500">
                {{ settings.defaultModel ? formatPrice(settings.defaultModel.pricing.prompt) + ' (Prompt)' : '' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 模型列表 -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-medium text-gray-900">
            可用模型 ({{ filteredModels.length }})
          </h2>
          <div class="text-sm text-gray-500">
            显示 {{ filteredModels.length }} / {{ settings.models.length }} 个模型
          </div>
        </div>

        <!-- 加载状态 -->
        <div v-if="settings.loading" class="flex justify-center py-12">
          <div class="text-center">
            <div class="mb-4 text-2xl">⏳</div>
            <div class="text-sm text-gray-600">加载模型列表中...</div>
          </div>
        </div>

        <!-- 错误状态 -->
        <div v-else-if="settings.error" class="rounded-xl border border-red-200 bg-red-50 p-4">
          <div class="flex items-center gap-3">
            <div class="text-red-600">⚠️</div>
            <div>
              <h3 class="text-sm font-medium text-red-900">加载失败</h3>
              <p class="text-sm text-red-700">{{ settings.error }}</p>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else-if="filteredModels.length === 0" class="text-center py-12">
          <div class="mb-4 text-2xl">🔍</div>
          <div class="text-sm text-gray-600">
            {{ searchQuery ? '没有找到匹配的模型' : '暂无可用模型' }}
          </div>
        </div>

        <!-- 模型列表 -->
        <div v-else class="space-y-3">
          <div
            v-for="model in filteredModels"
            :key="model.id"
            class="rounded-xl border border-gray-200 bg-white p-4 transition-all hover:shadow-sm"
            :class="isDefaultModel(model.id) ? 'border-blue-200 bg-blue-50' : ''"
          >
            <div class="flex items-start gap-4">
              <!-- 模型图标 -->
              <div class="rounded-lg bg-gray-100 p-3 text-2xl">
                {{ getArchitectureIcon(model.architecture.modality) }}
              </div>

              <!-- 模型信息 -->
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-4">
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <h3 class="text-base font-medium text-gray-900" v-html="highlightText(model.name, searchQuery)">
                      </h3>
                      <span v-if="isDefaultModel(model.id)" 
                            class="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                        默认
                      </span>
                    </div>
                    <p class="mt-1 text-sm text-gray-600 line-clamp-2">
                      {{ model.description }}
                    </p>
                    
                    <!-- 模型详情 -->
                    <div class="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                      <span class="flex items-center gap-1">
                        📏 {{ formatContextLength(model.context_length) }} tokens
                      </span>
                      <span class="flex items-center gap-1">
                        💰 {{ formatPrice(model.pricing.prompt) }} (Prompt)
                      </span>
                      <span class="flex items-center gap-1">
                        💰 {{ formatPrice(model.pricing.completion) }} (Completion)
                      </span>
                      <span class="flex items-center gap-1">
                        🏷️ <span v-html="highlightText(model.id, searchQuery)"></span>
                      </span>
                      <span v-if="model.architecture.input_modalities.includes('image')" 
                            class="flex items-center gap-1">
                        🖼️ 支持图像
                      </span>
                    </div>
                  </div>

                  <!-- 操作按钮 -->
                  <div class="flex flex-col items-end gap-2">
                    <button
                      v-if="!isDefaultModel(model.id)"
                      class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      @click="setDefaultModel(model.id)"
                    >
                      设为默认
                    </button>
                    <button
                      v-else
                      class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
                      disabled
                    >
                      当前默认
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>