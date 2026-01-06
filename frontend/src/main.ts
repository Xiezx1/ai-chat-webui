import { createApp } from "vue";
import { createPinia } from "pinia";
import router from "./router";
import App from "./App.vue";

import "./style.css";

const app = createApp(App);
app.use(createPinia());
app.use(router);

// 等待首次路由解析 + 守卫执行完再挂载
router.isReady().then(() => {
  app.mount("#app");
});
