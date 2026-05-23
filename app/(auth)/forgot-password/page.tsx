import type { Metadata } from 'next';
import { ForgotPasswordForm } from './ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Recuperar contraseña — Wapy',
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
