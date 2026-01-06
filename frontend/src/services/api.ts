export type ApiErrorBody = { error?: { code?: string; message?: string } };

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}



export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const hasJsonStringBody = typeof init.body === "string" && init.body.length > 0;
  const headers = new Headers(init.headers || {});
  // 只有在确实发送 JSON body 时才设置 Content-Type。
  // 否则像 DELETE 这类无 body 的请求会触发 Fastify 的 FST_ERR_CTP_EMPTY_JSON_BODY。
  if (!headers.has("Content-Type") && hasJsonStringBody) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    credentials: "include",
    headers,
    ...init,
  });

  // 尽量解析 JSON（有些错误可能不是 JSON）
  const text = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg =
      (data as ApiErrorBody)?.error?.message ||
      `请求失败 (${res.status})`;
    const code =
      (data as ApiErrorBody)?.error?.code ||
      "HTTP_ERROR";
    
    
    
    throw new ApiError(res.status, code, msg);
  }

  return (data ?? {}) as T;
}