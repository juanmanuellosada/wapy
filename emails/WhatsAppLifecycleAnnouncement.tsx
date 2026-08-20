import { Button, Heading, Link, Text } from '@react-email/components';
import * as React from 'react';
import { Layout } from './_components/Layout';

interface WhatsAppLifecycleAnnouncementProps {
  storeName: string;
  ordersUrl: string;
  settingsUrl: string;
}

export default function WhatsAppLifecycleAnnouncement({
  storeName,
  ordersUrl,
  settingsUrl,
}: WhatsAppLifecycleAnnouncementProps) {
  return (
    <Layout previewText="Cambios en cómo Wapy maneja tus pedidos de WhatsApp">
      <Heading style={heading}>Vamos a actualizar cómo Wapy maneja tus pedidos de WhatsApp</Heading>
      <Text style={paragraph}>Estos cambios se activan en los próximos días en {storeName}.</Text>

      <Text style={paragraph}>
        Apenas se active, si un pedido que te llega por WhatsApp queda pendiente más de 7 días sin
        que lo confirmes, Wapy lo cancela automáticamente: repone el stock y libera el cupón que
        se haya usado, para que no queden productos reservados para siempre por pedidos que nunca
        se concretaron.
      </Text>

      <Text style={paragraph}>
        Esa cancelación es reversible: si la venta sí se hizo pero no llegaste a confirmarla a
        tiempo, no se pierde, vas a poder revivir el pedido desde el panel con un clic, y vuelve a
        contarse como confirmado, con su stock y su cupón descontados otra vez.
      </Text>

      <Text style={paragraph}>
        No tenés que hacer nada. Este cambio no toca los pedidos pendientes que ya tenías antes de
        esta actualización: quedan exactamente como están, y vas a poder revisarlos con calma
        desde el panel.
      </Text>

      <Text style={paragraph}>
        Además, el mensaje de WhatsApp que recibís con cada pedido nuevo va a incluir un enlace
        directo para verlo y confirmarlo: confirmar un pedido queda reducido a un solo toque.
      </Text>

      <Text style={paragraph}>
        También vamos a corregir un error en el cálculo de los ingresos que ves en el panel: antes
        se sumaba el total del pedido sin descontar los cupones aplicados, así que el número podía
        estar inflado. Vas a ver el monto correcto de acá en adelante — si te parece más bajo que
        antes, es porque se estaba contando mal, no porque hayas vendido menos.
      </Text>

      <Text style={paragraph}>
        Si querés, vas a poder ajustar los 7 días o activar la confirmación automática de pedidos
        pendientes desde la{' '}
        <Link href={settingsUrl} style={inlineLink}>
          configuración de tu tienda
        </Link>
        .
      </Text>

      <Button href={ordersUrl} style={button}>
        Ver mis pedidos
      </Button>
    </Layout>
  );
}

const heading: React.CSSProperties = {
  color: '#16222E',
  fontSize: '20px',
  fontWeight: 'bold',
  margin: '0 0 8px',
};

const paragraph: React.CSSProperties = {
  color: '#666666',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '0 0 16px',
};

const inlineLink: React.CSSProperties = {
  color: '#16222E',
  fontWeight: 'bold',
  textDecoration: 'underline',
};

const button: React.CSSProperties = {
  backgroundColor: '#F5C84B',
  borderRadius: '50px',
  color: '#16222E',
  display: 'inline-block',
  fontSize: '14px',
  fontWeight: '800',
  marginTop: '8px',
  padding: '12px 24px',
  textDecoration: 'none',
};
