import { initShell } from "../shell.js";
import { render } from "../views/todos-sk.js";

const { root } = await initShell({ page: "todos-sk" });
if (root) {
  root.innerHTML = "";
  render(root, {}, () => false);
}
