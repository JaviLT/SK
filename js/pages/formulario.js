import { initShell } from "../shell.js";
import { render } from "../views/formulario.js";

const { root } = await initShell({ page: "formulario" });
if (root) {
  root.innerHTML = "";
  render(root, {}, () => false);
}
