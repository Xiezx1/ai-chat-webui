import { defineStore } from "pinia";
import { apiFetch } from "../services/api";

type User = { id: number; username: string; isAdmin: boolean };

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null as User | null,
    loading: false,
    inited: false,
  }),
  actions: {
    async fetchMe() {
      try {
        const res = await apiFetch<{ user: User }>("/api/auth/me");
        this.user = res.user;
      } catch {
        this.user = null;
      }finally {
        this.inited = true;
      }
    },
    async login(username: string, password: string) {
      this.loading = true;
      try {
        const res = await apiFetch<{ user: User }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ username, password }),
        });
        this.user = res.user;
      } finally {
        this.loading = false;
      }
    },
    async logout() {
      await apiFetch("/api/auth/logout", { method: "POST" });
      this.user = null;
    },
  },
});
