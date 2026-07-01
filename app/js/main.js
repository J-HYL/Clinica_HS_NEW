import { closeSidebarBtn, openSidebarBtn } from "./modules/selectores.js";
import { closeSidebar, openSidebar, toggleTabIndex } from "./modules/components/Sidebar.js";
import "./modules/components/Soporte.js"; // widget flotante de soporte (se autoinicializa)

document.addEventListener("DOMContentLoaded", () => {
    toggleTabIndex();
})

openSidebarBtn.addEventListener("click", openSidebar);
closeSidebarBtn.addEventListener("click", closeSidebar);