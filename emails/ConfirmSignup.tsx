import { Button, Heading, Link, Text } from '@react-email/components';
import * as React from 'react';
import { Layout } from './_components/Layout';

interface ConfirmSignupProps {
  url: string;
}

export default function ConfirmSignup({ url }: ConfirmSignupProps) {
  return (
    <Layout previewText="Confirmá tu cuenta de Wapy">
      <Heading style={heading}>¡Bienvenido/a a Wapy!</Heading>
      <Text style={paragraph}>
        Gracias por registrarte. Para activar tu cuenta, hacé clic en el botón de abajo.
      </Text>
      <Button href={url} style={button}>
        Confirmar mi cuenta
      </Button>
      <Text style={hint}>
        Si el botón no funciona, copiá este enlace en tu navegador:
        <br />
        <Link href={url} style={link}>
          {url}
        </Link>
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
