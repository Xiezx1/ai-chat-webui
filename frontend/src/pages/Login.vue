<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="w-full max-w-sm bg-white border border-gray-200 rounded-xl p-6">
      <h1 class="text-xl font-semibold mb-4">登录</h1>

      <form @submit.prevent="onSubmit" class="space-y-3">
        <input
          v-model="username"
          class="w-full border rounded-lg px-3 py-2"
          placeholder="用户名"
          autocomplete="username"
        />
        <input
          v-model="password"
          type="password"
          class="w-full border rounded-lg px-3 py-2"
          placeholder="密码"
          autocomplete="current-password"
        />

        <button
          class="w-full rounded-lg px-3 py-2 bg-black text-white disabled:opacity-50"
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
