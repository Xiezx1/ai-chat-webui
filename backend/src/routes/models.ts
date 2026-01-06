import type { FastifyPluginAsync } from "fastify";

interface ModelInfo {
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

interface ModelListResponse {
  data: ModelInfo[];
}

const routes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const response = await fetch("https://api.x1zx.com/api/v1/models", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        return reply.code(500).send({
          error: {
            code: "PROXY_ERROR",
            message: "获取模型列表失败",
          },
        });
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      app.log.error("Failed to fetch models:", error);
      return reply.code(500).send({
        error: {
          code: "PROXY_ERROR",
          message: "代理请求失败",
        },
      });
    }
  });
};

export default routes;