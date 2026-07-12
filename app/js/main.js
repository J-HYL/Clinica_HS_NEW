import { closeSidebarBtn, openSidebarBtn } from "./modules/selectores.js";
import { closeSidebar, openSidebar, toggleTabIndex } from "./modules/components/Sidebar.js";
import "./modules/components/Soporte.js"; // widget flotante de soporte (se autoinicializa)
import "./entorno.js"; // marquesina de aviso en preproduccion (se autoinyecta solo en pre.*)

document.addEventListener("DOMContentLoaded", () => {
    toggleTabIndex();
})

openSidebarBtn.addEventListener("click", openSidebar);
closeSidebarBtn.addEventListener("click", closeSidebar);