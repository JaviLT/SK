import { initShell } from "../shell.js";
import { render } from "../views/dashboard.js";

const { root } = await initShell({ page: "dashboard" });
if (root) {
  root.innerHTML = "";
  render(root, {}, () => false);
}
