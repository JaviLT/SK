import { initShell } from "../shell.js";
import { render } from "../views/mis-kaizens.js";

const { root } = await initShell({ page: "mis-kaizens" });
if (root) {
  root.innerHTML = "";
  render(root, {}, () => false);
}
