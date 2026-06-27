import { Button, Heading, Link, Text } from '@react-email/components';
import * as React from 'react';
import { Layout } from './_components/Layout';

interface PasswordResetProps {
  url: string;
}

export default function PasswordReset({ url }: PasswordResetProps) {
  return (
    <Layout previewText="Restablecé tu contraseña de Wapy">
      <Heading style={heading}>Restablecé tu contraseña</Heading>
      <Text style={paragraph}>
        Recibimos una solicitud para restablecer la contraseña de tu cuenta en Wapy. Hacé clic en el botón de abajo para crear una nueva contraseña.
      </Text>
      <Button href={url} style={button}>
        Restablecer contraseña
      </Button>
      <Text style={hint}>
        Si el botón no funciona, copiá este enlace en tu navegador:
        <br />
        <Link href={url} style={link}>
          {url}
        </Link>
      </Text>
      <Text style={disclaimer}>
        Si no solicitaste restablecer tu contraseña, podés ignorar este email. Tu contraseña no cambiará.
      </Text>
    </Layout>
  );
}

const heading: React.CSSProperties = {
  color: '#16222E',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '0 0 16px',
};

const paragraph: React.CSSProperties = {
  color: '#555555',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 32px',
};

const button: React.CSSProperties = {
  backgroundColor: '#F5C84B',
  borderRadius: '50px',
  color: '#16222E',
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: '800',
  padding: '16px 32px',
  textDecoration: 'none',
};

const hint: React.CSSProperties = {
  color: '#999999',
  fontSize: '13px',
  lineHeight: '1.6',
  margin: '32px 0 0',
};

const link: React.CSSProperties = {
  color: '#F5C84B',
  wordBreak: 'break-all',
};

const disclaimer: React.CSSProperties = {
  color: '#999999',
  fontSize: '13px',
  lineHeight: '1.6',
  margin: '16px 0 0',
};
