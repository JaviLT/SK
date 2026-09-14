import { initShell } from "../shell.js";
import { render } from "../views/detalle.js";
import { getQueryParam } from "../utils.js";

const { root } = await initShell({ page: "detalle" });
if (root) {
  root.innerHTML = "";
  render(root, { id: getQueryParam("id") }, () => false);
}
