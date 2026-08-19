import { el, toast } from "../utils.js";
import { api } from "../api.js";
import { setState } from "../state.js";
import { CONFIG } from "../config.js";
import { showChrome } from "../app.js";

export async function render(container) {
  const errorBox = el("div", { class: "login-error", id: "login-error" });

  const nominaInput = el("input", {
    class: "input", id: "login-nomina", type: "text",
    placeholder: "Ej. 2087", autocomplete: "username",
  });
  const passInput = el("input", {
    class: "input", id: "login-pass", type: "password",
    placeholder: "••••••••", autocomplete: "current-password",
  });

  const submitBtn = el("button", { class: "btn btn-primary btn-full", type: "submit" }, ["Iniciar sesión"]);

  const form = el(
    "form",
    {
      class: "login-form",
      onsubmit: async (e) => {
        e.preventDefault();
        errorBox.classList.remove("show");
        const nomina = nominaInput.value.trim();
        const password = passInput.value;
        if (!nomina || !password) {
          errorBox.textContent = "Ingresa tu número de nómina y tu contraseña.";
          errorBox.classList.add("show");
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = "Verificando…";
        try {
          const user = await api.login(nomina, password);
          setState({ user });
          const { goTo } = await import("../router.js");
          if (user.requiereCambioPassword) {
            // Primer login: no se muestra la barra de navegación todavía —
            // primero hay que definir una contraseña propia.
            goTo("cambiar-password");
            return;
          }
          toast(`Bienvenido, ${user.nombre.split(" ")[0]}`, "tg");
          showChrome(user);
          goTo("historial");
        } catch (err) {
          errorBox.textContent = err.message || "No se pudo iniciar sesión.";
          errorBox.classList.add("show");
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = "Iniciar sesión";
        }
      },
    },
    [
      el("div", { class: "field" }, [el("label", { for: "login-nomina" }, ["Número de nómina"]), nominaInput]),
      el("div", { class: "field" }, [el("label", { for: "login-pass" }, ["Contraseña"]), passInput]),
      submitBtn,
    ]
  );

  const mockHint = CONFIG.MOCK_MODE
    ? el("p", { class: "hint", style: "text-align:center;margin-top:14px" }, [
        "Modo de demostración — usa nómina ",
        el("strong", {}, ["0001"]),
        " / contraseña ",
        el("strong", {}, ["demo123"]),
      ])
    : null;

  const card = el("div", { class: "login-card" }, [
    el("div", { class: "login-mark" }, ["ZX"]),
    el("h1", {}, [CONFIG.APP_NAME]),
    el("p", { class: "sub" }, [CONFIG.COMPANY_NAME]),
    errorBox,
    form,
    mockHint,
  ]);

  container.appendChild(el("div", { class: "login-screen" }, [card]));
  nominaInput.focus();
}

export function unmount() {}
