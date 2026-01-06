<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
    <div class="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div class="mb-6">
        <div class="text-xs font-medium text-gray-500">AI Chat</div>
        <h1 class="mt-1 text-xl font-semibold text-gray-900">登录</h1>
        <div class="mt-1 text-sm text-gray-500">使用你的账号开始聊天</div>
      </div>

      <form @submit.prevent="onSubmit" class="space-y-3">
        <div class="space-y-2">
          <input
            v-model="username"
            class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
            placeholder="用户名"
            autocomplete="username"
          />
          <input
            v-model="password"
            type="password"
            class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
            placeholder="密码"
            autocomplete="current-password"
          />
        </div>

        <button
          class="w-full rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="auth.loading"
        >
          {{ auth.loading ? "登录中..." : "登录" }}
        </button>

        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const auth = useAuthStore();

const username = ref("");
const password = ref("");
const error = ref("");

async function onSubmit() {
  error.value = "";
  try {
    await auth.login(username.value, password.value);
    router.push("/chat");
  } catch (e: any) {
    error.value = e?.message || "登录失败";
  }
}
</script>
