import { closeSidebarBtn, openSidebarBtn } from "./modules/selectores.js";
import { closeSidebar, openSidebar, toggleTabIndex } from "./modules/components/Sidebar.js";

document.addEventListener("DOMContentLoaded", () => {
    toggleTabIndex();
})

openSidebarBtn.addEventListener("click", openSidebar);
closeSidebarBtn.addEventListener("click", closeSidebar);