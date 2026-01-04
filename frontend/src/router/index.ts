import { createRouter, createWebHistory } from "vue-router";
import Login from "../pages/Login.vue";
import Chat from "../pages/Chat.vue";
import Settings from "../pages/Settings.vue";
import { useAuthStore } from "../stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: Login },
    { path: "/", redirect: "/chat" },
    { path: "/chat", component: Chat, meta: { requiresAuth: true } },
    { path: "/settings", component: Settings, meta: { requiresAuth: true } },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (!auth.inited) {
    await auth.fetchMe();
  }

  if (to.meta.requiresAuth && !auth.user) return "/login";
  if (to.path === "/login" && auth.user) return "/chat";
});

export default router;
