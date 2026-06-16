export const appointmentStatusIcon = {
  completada: "ri-checkbox-circle-fill",
  pendiente: "ri-hourglass-fill",
  cancelada: "ri-close-circle-fill"
}

export const validationFormConfig = {
    'required': {
      validate: (value) => value.trim() !== '',
      message: '¡El campo es obligatorio!'
    },
    'phone': {
      validate: (value) => value === "" || phoneRegex.test(value),
      message: '¡Formato de telefono inválido!'
    }
};

const phoneRegex = /^\d{7,12}$/;