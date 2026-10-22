import { initShell } from "../shell.js";
import { render } from "../views/gemba4.js";

const { root } = await initShell({ page: "gemba4" });
if (root) {
  root.innerHTML = "";
  render(root, {}, () => false);
}
