import { api } from "../api.js";
import { render } from "../views/login.js";

// Si ya hay sesión iniciada, no tiene sentido mostrar el login de nuevo.
const user = await api.restoreSession().catch(() => null);
if (user) {
  window.location.replace(user.requiereCambioPassword ? "cambiar-password.html" : "mis-kaizens.html");
} else {
  const root = document.getElementById("app-root");
  root.innerHTML = "";
  render(root);
}
