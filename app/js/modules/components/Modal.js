import { modal, medicoModal } from "../selectores.js";

//modal.js

export function openModal() {
    modal.show();
}


export function closeModal() {
    modal.classList.add("closing");
    setTimeout(() => {
        modal.close();
        modal.classList.remove("closing");
    }, 300);
}

//Modal medico

export function openMedicoModal() {
  medicoModal.show();
}

export function closeMedicoModal() {
  medicoModal.classList.add("closing");
  setTimeout(() => {
    medicoModal.close();
    medicoModal.classList.remove("closing");
  }, 300);
}