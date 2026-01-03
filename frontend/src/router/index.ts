import { createRouter, createWebHistory } from "vue-router";
import Login from "../pages/Login.vue";
import Chat from "../pages/Chat.vue";
import { useAuthStore } from "../stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: Login },
    { path: "/", redirect: "/chat" },
    { path: "/chat", component: Chat, meta: { requiresAuth: true } },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  // 刷新页面后先拉一次 /me
  if (auth.user === null) {
    await auth.fetchMe();
  }

  if (to.meta.requiresAuth && !auth.user) {
    return "/login";
  }

  if (to.path === "/login" && auth.user) {
    return "/chat";
  }
});

export default router;
