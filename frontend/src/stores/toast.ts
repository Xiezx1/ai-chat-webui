import { defineStore } from "pinia";

export type Toast = {
  id: number;
  type: "info" | "success" | "error";
  message: string;
};

export const useToastStore = defineStore("toast", {
  state: () => ({
    toasts: [] as Toast[],
  }),
  actions: {
    show(message: string, type: Toast["type"] = "info", ttl = 2500) {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      this.toasts.push({ id, type, message });
      setTimeout(() => this.dismiss(id), ttl);
    },
    dismiss(id: number) {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    },
    clear() {
      this.toasts = [];
    },
  },
});