import { createTableInstance } from "../components/Datatables.js";
import UI from "../classes/UI.js";

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const mainLoading = document.querySelector(".main__loading");
        const mainEmpty = document.querySelector(".main__empty");
        const table = document.querySelector("#table");

        // Mostrar animación de carga
        mainLoading.style.display = "flex";
        mainEmpty.style.display = "none";
        table.style.display = "none";

        const res = await fetch("https://app.hsdental.es/api/DB.php?table=facturas");
        const data = await res.json();

        if (!data.success) throw new Error(data.error || "Error al cargar las facturas");

        const facturas = data.facturas || [];

        // 🔹 Si no hay registros
        if (facturas.length === 0) {
            mainLoading.style.display = "none";
            mainEmpty.style.display = "flex";
            return;
        }

        // 🔹 Mostrar DataTable
        mainLoading.style.display = "none";
        table.style.display = "table";
        createTableInstance(facturas);

 
      
    } catch (err) {
        console.error("Error cargando facturas:", err);
        UI.showAlert("Error al cargar facturas: " + err.message, "error");
    }
});