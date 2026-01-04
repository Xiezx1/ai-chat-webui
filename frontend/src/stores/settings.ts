import { defineStore } from "pinia";
import { apiFetch } from "../services/api";

export interface ModelInfo {
  id: string;
  canonical_slug: string;
  name: string;
  description: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
    request: string;
    image: string;
    web_search: string;
    internal_reasoning: string;
  };
  supported_parameters: string[];
  default_parameters: {
    temperature: number | null;
    top_p: number | null;
    frequency_penalty: number | null;
  };
  architecture: {
    modality: string;
    input_modalities: string[];
    output_modalities: string[];
    tokenizer: string;
    instruct_type: string | null;
  };
  created: number;
  top_provider: {
    context_length: number;
    max_completion_tokens: number | null;
    is_moderated: boolean;
  };
  per_request_limits: any;
  hugging_face_id: string;
}

export interface ModelListResponse {
  data: ModelInfo[];
}

export interface UserSettings {
  defaultModel: string;
  models: {
    [modelId: string]: {
      temperature?: number;
      top_p?: number;
      frequency_penalty?: number;
      max_tokens?: number;
    };
  };
}

export const useSettingsStore = defineStore("settings", {
  state: () => ({
    models: [] as ModelInfo[],
    loading: false,
    error: "" as string,
    userSettings: {
      defaultModel: "openai/gpt-4o-mini",
      models: {},
    } as UserSettings,
  }),

  getters: {
    // 获取当前默认模型
    defaultModel(): ModelInfo | null {
      return this.models.find(m => m.id === this.userSettings.defaultModel) || null;
    },

    // 获取模型列表（按名称排序）
    sortedModels(): ModelInfo[] {
      return [...this.models].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    },

    // 搜索过滤后的模型列表
    filteredModels(): ModelInfo[] {
      return this.sortedModels;
    },
  },

  actions: {
    // 加载模型列表
    async loadModels() {
      this.loading = true;
      this.error = "";
      
      try {
        const response = await apiFetch<ModelListResponse>("/api/models");
        this.models = response.data || [];
        
        // 确保默认模型存在于列表中
        if (this.models.length > 0 && !this.models.find(m => m.id === this.userSettings.defaultModel)) {
          this.userSettings.defaultModel = this.models[0].id;
        }
      } catch (error: any) {
        this.error = error.message || "加载模型列表失败";
        console.error("Failed to load models:", error);
      } finally {
        this.loading = false;
      }
    },

    // 设置默认模型
    setDefaultModel(modelId: string) {
      if (this.models.find(m => m.id === modelId)) {
        this.userSettings.defaultModel = modelId;
        this.saveSettings();
      }
    },

    // 更新模型参数
    updateModelParams(modelId: string, params: any) {
      if (!this.userSettings.models[modelId]) {
        this.userSettings.models[modelId] = {};
      }
      this.userSettings.models[modelId] = {
        ...this.userSettings.models[modelId],
        ...params,
      };
      this.saveSettings();
    },

    // 获取模型的参数
    getModelParams(modelId: string) {
      const model = this.models.find(m => m.id === modelId);
      const userParams = this.userSettings.models[modelId] || {};
      
      return {
        temperature: userParams.temperature ?? model?.default_parameters.temperature ?? 1,
        top_p: userParams.top_p ?? model?.default_parameters.top_p ?? 0.9,
        frequency_penalty: userParams.frequency_penalty ?? model?.default_parameters.frequency_penalty ?? 0,
        max_tokens: userParams.max_tokens ?? 4000,
      };
    },

    // 保存设置到本地存储
    saveSettings() {
      try {
        localStorage.setItem("ai-chat-settings", JSON.stringify(this.userSettings));
      } catch (error) {
        console.error("Failed to save settings:", error);
      }
    },

    // 从本地存储加载设置
    loadSettings() {
      try {
        const saved = localStorage.getItem("ai-chat-settings");
        if (saved) {
          this.userSettings = { ...this.userSettings, ...JSON.parse(saved) };
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    },

    // 初始化设置
    async init() {
      this.loadSettings();
      if (this.models.length === 0) {
        await this.loadModels();
      }
    },
  },
});