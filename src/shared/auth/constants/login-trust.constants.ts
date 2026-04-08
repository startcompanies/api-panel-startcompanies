/** Cookie HttpOnly con identificador de dispositivo de confianza (login sin OTP). */
export const PANEL_DEVICE_TRUST_COOKIE = 'panel_device_trust';

export const LOGIN_TRUST_DAYS = 180;

export const LOGIN_TRUST_MAX_AGE_MS = LOGIN_TRUST_DAYS * 24 * 60 * 60 * 1000;
