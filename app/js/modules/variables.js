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