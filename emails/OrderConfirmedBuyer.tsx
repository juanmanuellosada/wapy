import { Column, Heading, Row, Section, Text } from '@react-email/components';
import * as React from 'react';
import { Layout } from './_components/Layout';

interface OrderConfirmedBuyerItem {
  productName: string;
  quantity: number;
  variantLabel?: string | null;
  lineTotalFormatted: string;
}

interface OrderConfirmedBuyerProps {
  storeName: string;
  orderRef: string;
  items: OrderConfirmedBuyerItem[];
  totalFormatted: string;
}

export default function OrderConfirmedBuyer({
  storeName,
  orderRef,
  items,
  totalFormatted,
}: OrderConfirmedBuyerProps) {
  return (
    <Layout previewText={`Tu pago en ${storeName} fue confirmado`}>
      <Heading style={heading}>¡Tu pago fue confirmado!</Heading>
      <Text style={paragraph}>
        Recibimos tu pago para el pedido <strong>#{orderRef.slice(0, 8)}</strong> en {storeName}. Tu pedido ya está confirmado y en camino a coordinarse por WhatsApp con la tienda.
      </Text>

      <Section style={table}>
        {items.map((item, i) => (
          <Row key={i} style={i % 2 === 0 ? rowOdd : rowEven}>
            <Column style={itemCell}>
              {item.quantity}x {item.productName}
              {item.variantLabel ? ` (${item.variantLabel})` : ''}
            </Column>
            <Column style={priceCell}>{item.lineTotalFormatted}</Column>
          </Row>
        ))}
        <Row style={totalRow}>
          <Column style={totalLabel}>Total</Column>
          <Column style={totalValue}>{totalFormatted}</Column>
        </Row>
      </Section>

      <Text style={hint}>Gracias por tu compra en {storeName}.</Text>
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

const table: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  overflow: 'hidden',
  width: '100%',
};

const rowOdd: React.CSSProperties = {
  backgroundColor: '#f9fafb',
};

const rowEven: React.CSSProperties = {
  backgroundColor: '#ffffff',
};

const itemCell: React.CSSProperties = {
  borderTop: '1px solid #e5e7eb',
  color: '#16222E',
  fontSize: '14px',
  padding: '10px 16px',
};

const priceCell: React.CSSProperties = {
  borderTop: '1px solid #e5e7eb',
  color: '#16222E',
  fontSize: '14px',
  fontWeight: 'bold',
  padding: '10px 16px',
  textAlign: 'right',
  whiteSpace: 'nowrap',
  width: '100px',
};

const totalRow: React.CSSProperties = {
  backgroundColor: '#FBF7EC',
};

const totalLabel: React.CSSProperties = {
  borderTop: '1px solid #e5e7eb',
  color: '#16222E',
  fontSize: '14px',
  fontWeight: 'bold',
  padding: '10px 16px',
};

const totalValue: React.CSSProperties = {
  borderTop: '1px solid #e5e7eb',
  color: '#16222E',
  fontSize: '16px',
  fontWeight: 'bold',
  padding: '10px 16px',
  textAlign: 'right',
  whiteSpace: 'nowrap',
  width: '100px',
};

const hint: React.CSSProperties = {
  color: '#999999',
  fontSize: '13px',
  lineHeight: '1.6',
  margin: '32px 0 0',
};
