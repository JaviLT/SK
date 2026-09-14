import { initShell } from "../shell.js";
import { render } from "../views/solicitudes.js";

const { root } = await initShell({ page: "solicitudes" });
if (root) {
  root.innerHTML = "";
  render(root, {}, () => false);
}
