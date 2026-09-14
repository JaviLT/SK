import { initShell } from "../shell.js";
import { render } from "../views/admin.js";

const { root } = await initShell({ page: "admin" });
if (root) {
  root.innerHTML = "";
  render(root, {}, () => false);
}
