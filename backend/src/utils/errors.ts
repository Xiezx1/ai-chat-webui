export function toPublicError(err: any) {
  const statusCode = err?.statusCode || err?.status || 500;

  // 给前端看的：尽量友好
  const message =
    err?.message ||
    (statusCode === 401 ? "请先登录" : "服务异常，请稍后重试");

  const code =
    err?.code ||
    (statusCode === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR");

  return {
    statusCode,
    body: {
      error: {
        code,
        message,
      },
    },
  };
}