import { initShell } from "../shell.js";
import { render } from "../views/cambiar-password.js";

const { user, root } = await initShell({ page: "cambiar-password", allowPendingPasswordChange: true });
if (root && user && user.requiereCambioPassword) {
  root.innerHTML = "";
  render(root);
} else if (root && user) {
  // Sesión sin la bandera de cambio obligatorio — no hay nada que hacer aquí.
  window.location.replace("mis-kaizens.html");
}
