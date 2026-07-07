// Email validation
export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// Password validation
export const validatePassword = (password) => {
  if (password.length < 6) {
    return { valid: false, message: 'Şifre en az 6 karakter olmalıdır.' };
  }
  return { valid: true, message: '' };
};

// Name validation
export const validateName = (name) => {
  if (!name || name.trim().length < 2) {
    return { valid: false, message: 'Ad Soyad en az 2 karakter olmalıdır.' };
  }
  return { valid: true, message: '' };
};

// Form validation for signup
export const validateSignupForm = (name, email, password) => {
  const errors = {};

  const nameValidation = validateName(name);
  if (!nameValidation.valid) {
    errors.name = nameValidation.message;
  }

  if (!validateEmail(email)) {
    errors.email = 'Geçerli bir e-posta adresi giriniz.';
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    errors.password = passwordValidation.message;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// Form validation for login
export const validateLoginForm = (email, password) => {
  const errors = {};

  if (!validateEmail(email)) {
    errors.email = 'Geçerli bir e-posta adresi giriniz.';
  }

  if (!password) {
    errors.password = 'Şifre gereklidir.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};
