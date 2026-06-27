import { Button, Heading, Link, Text } from '@react-email/components';
import * as React from 'react';
import { Layout } from './_components/Layout';

interface InviteProps {
  inviteUrl: string;
}

export default function Invite({ inviteUrl }: InviteProps) {
  return (
    <Layout previewText="¡Estás invitado a crear tu tienda en Wapy!">
      <Heading style={heading}>¡Estás invitado a Wapy!</Heading>
      <Text style={paragraph}>
        Recibiste una invitación para crear tu tienda online en Wapy. Con Wapy podés armar tu catálogo de productos y recibir pedidos directo por WhatsApp.
      </Text>
      <Text style={paragraph}>
        Hacé clic en el botón de abajo para activar tu cuenta. Este enlace es válido por 7 días.
      </Text>
      <Button href={inviteUrl} style={button}>
        Crear mi tienda gratis
      </Button>
      <Text style={hint}>
        Si el botón no funciona, copiá este enlace en tu navegador:
        <br />
        <Link href={inviteUrl} style={link}>
          {inviteUrl}
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
  margin: '0 0 24px',
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
